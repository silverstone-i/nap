/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { randomUUID } from 'node:crypto';
import { repositories } from '../repositories.js';
import { requireCondition } from '../../../application/shared/errors.js';
const order = ['countries', 'currencies', 'seed_versions'];
async function catalog(db, schema) {
  const columns = await db.any(
    `SELECT c.relname AS table, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required, pg_get_expr(d.adbin,d.adrelid) AS value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    [schema, order]
  );
  const constraints = await db.any(
    `SELECT c.relname AS table, x.contype AS type, pg_get_constraintdef(x.oid) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2) ORDER BY c.relname,x.contype,pg_get_constraintdef(x.oid)`,
    [schema, order]
  );
  return JSON.stringify({ columns, constraints }).replaceAll(
    schema + '.',
    'SCHEMA.'
  );
}
/**
 * Verify that the connected cell database matches the `reference-data`
 * contract (M0004 §7, §9).
 *
 * Checks `reference` schema ownership and grants, the table set, `nap-app`
 * holding `SELECT` only, absence of PUBLIC access, and the
 * `reference.schema_migrations` ledger. It then builds the runtime model
 * definitions in a scratch schema inside a rolled-back transaction and
 * compares the two catalogs. Database and role safety are `verifyCell`'s.
 * @param {import('pg-schemata').Database} handle Connected handle for `nap-admin`.
 * @param {object[]} modules Validated cell module descriptors.
 * @returns {Promise<void>}
 * @throws {MaintenanceError} A `*_CONTRACT_MISMATCH`, `TABLE_GRANT_MISMATCH`, or `PUBLIC_ACCESS` code naming the first failed check.
 */
export async function verifyReferenceData(handle, modules) {
  const { db, pgp } = handle;
  const schema = await db.one(
    `SELECT pg_get_userbyid(nspowner) AS owner, has_schema_privilege('nap-app',oid,'USAGE') AS usage,has_schema_privilege('nap-app',oid,'CREATE') AS create FROM pg_namespace WHERE nspname='reference'`
  );
  requireCondition(
    schema.owner === 'nap-admin' && schema.usage && !schema.create,
    'SCHEMA_CONTRACT_MISMATCH'
  );
  const tables = await db.any(
    `SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='reference' AND c.relkind IN ('r','p') ORDER BY c.relname`
  );
  requireCondition(
    JSON.stringify(tables.map(t => t.name)) ===
      JSON.stringify([...order, 'schema_migrations'].sort()) &&
      tables.every(t => t.owner === 'nap-admin' && !t.rls),
    'TABLE_CONTRACT_MISMATCH'
  );
  for (const table of tables) {
    const granted = table.name === 'schema_migrations' ? [] : ['SELECT'];
    for (const privilege of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const row = await db.one(
        'SELECT has_table_privilege($1,$2,$3) AS allowed',
        ['nap-app', `reference.${table.name}`, privilege]
      );
      requireCondition(
        row.allowed === granted.includes(privilege),
        'TABLE_GRANT_MISMATCH'
      );
    }
  }
  const publicAccess = await db.one(
    `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='reference' AND a.grantee=0 UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='reference' AND a.grantee=0) AS unsafe`
  );
  requireCondition(!publicAccess.unsafe, 'PUBLIC_ACCESS');
  const ledger = await db.any(
    'SELECT module_name,migration_id,hash FROM reference.schema_migrations ORDER BY module_name,migration_id'
  );
  const wanted = modules
    .filter(m => m.schema === 'reference')
    .flatMap(m =>
      m.migrations.map(x => ({
        module_name: m.name,
        migration_id: x.id,
        hash: x.checksum,
      }))
    )
    .sort(
      (a, b) =>
        a.module_name.localeCompare(b.module_name) ||
        a.migration_id.localeCompare(b.migration_id)
    );
  requireCondition(
    JSON.stringify(ledger) === JSON.stringify(wanted),
    'LEDGER_CONTRACT_MISMATCH'
  );
  const scratch = 'verify_' + randomUUID().replaceAll('-', '');
  const rollback = new Error('verification rollback');
  try {
    await db.tx(async tx => {
      await tx.none('CREATE SCHEMA $1:name', [scratch]);
      for (const table of order) {
        const definition = structuredClone(repositories[table].schema);
        definition.dbSchema = scratch;
        await new TableModel(tx, pgp, definition).createTable();
      }
      requireCondition(
        (await catalog(tx, 'reference')) === (await catalog(tx, scratch)),
        'CATALOG_CONTRACT_MISMATCH'
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
