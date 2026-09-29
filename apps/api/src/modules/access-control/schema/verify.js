/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import { randomUUID } from 'node:crypto';
import { functionBodies, TENANT_POLICY_EXPRESSION } from './protections.js';
import { requireCondition } from '../../../application/shared/errors.js';
async function catalog(db, schema, order) {
  const columns = await db.any(
    `SELECT c.relname AS table, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS required, pg_get_expr(d.adbin,d.adrelid) AS value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname=$1 AND c.relname=ANY($2) AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`,
    [schema, order]
  );
  const constraints = await db.any(
    `SELECT c.relname AS table, x.contype AS type, pg_get_constraintdef(x.oid) AS definition FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname=ANY($2) ORDER BY c.relname,x.contype,pg_get_constraintdef(x.oid)`,
    [schema, order]
  );
  const indexes = await db.any(
    `SELECT tablename AS table,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname=$1 AND tablename=ANY($2) ORDER BY tablename,indexname`,
    [schema, order]
  );
  return JSON.stringify({ columns, constraints, indexes }).replaceAll(
    schema + '.',
    'SCHEMA.'
  );
}
/**
 * Verify that the connected cell database's `app` schema matches the
 * contract of every registered `app` module (`access-control`,
 * `business-directory`). `access-control` owns the schema-wide parts: the
 * `protect_record()` function and the grant rules.
 *
 * Checks `app` schema ownership and grants, the table set, row-level
 * security enabled and forced on every module table with the single
 * `tenant_isolation` policy (M0002-01-R006), `nap-app` table privileges,
 * absence of PUBLIC access, the trigger function and triggers, and the
 * `app.schema_migrations` ledger. It then builds the runtime model
 * definitions in a scratch schema inside a rolled-back transaction and
 * compares the two catalogs. Database and role safety are `verifyCell`'s.
 * @param {import('pg-schemata').Database} handle Connected handle for `nap-admin`.
 * @param {object[]} modules Validated cell module descriptors.
 * @returns {Promise<void>}
 * @throws {MaintenanceError} A `*_CONTRACT_MISMATCH`, `TABLE_GRANT_MISMATCH`, or `PUBLIC_ACCESS` code naming the first failed check.
 */
export async function verifyAppSchema(handle, modules) {
  const { db, pgp } = handle;
  // Every app module's models, in registry order so referenced tables come first.
  const models = Object.assign(
    {},
    ...modules.filter(m => m.schema === 'app').map(m => m.models)
  );
  const order = Object.keys(models);
  const schema = await db.one(
    `SELECT pg_get_userbyid(nspowner) AS owner, has_schema_privilege('nap-app',oid,'USAGE') AS usage,has_schema_privilege('nap-app',oid,'CREATE') AS create FROM pg_namespace WHERE nspname='app'`
  );
  requireCondition(
    schema.owner === 'nap-admin' && schema.usage && !schema.create,
    'SCHEMA_CONTRACT_MISMATCH'
  );
  const tables = await db.any(
    `SELECT c.relname AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity AS rls,c.relforcerowsecurity AS force FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind IN ('r','p') ORDER BY c.relname`
  );
  requireCondition(
    JSON.stringify(tables.map(t => t.name)) ===
      JSON.stringify([...order, 'schema_migrations'].sort()) &&
      tables.every(
        t =>
          t.owner === 'nap-admin' &&
          t.rls === (t.name !== 'schema_migrations') &&
          t.force === (t.name !== 'schema_migrations')
      ),
    'TABLE_CONTRACT_MISMATCH'
  );
  for (const table of tables) {
    const granted =
      table.name === 'schema_migrations'
        ? []
        : ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
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
        ['nap-app', `app.${table.name}`, privilege]
      );
      requireCondition(
        row.allowed === granted.includes(privilege),
        'TABLE_GRANT_MISMATCH'
      );
    }
  }
  const publicAccess = await db.one(
    `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname='app' AND a.grantee=0 UNION ALL SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='app' AND a.grantee=0) AS unsafe`
  );
  requireCondition(!publicAccess.unsafe, 'PUBLIC_ACCESS');
  const functions = await db.any(
    `SELECT p.proname AS name,p.prosrc AS body,p.prosecdef AS definer,pg_get_userbyid(p.proowner) AS owner, EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0) AS public FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' ORDER BY p.proname`
  );
  requireCondition(
    functions.length === Object.keys(functionBodies).length &&
      functions.every(
        f =>
          f.body === functionBodies[f.name] &&
          !f.definer &&
          !f.public &&
          f.owner === 'nap-admin'
      ),
    'FUNCTION_CONTRACT_MISMATCH'
  );
  const triggers = await db.any(
    `SELECT c.relname AS table,t.tgname AS name,t.tgtype AS type,t.tgenabled AS enabled,p.proname AS function,encode(t.tgargs,'escape') AS args FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='app' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`
  );
  const expected = [...order].sort().map(table => ({
    table,
    name: 'protect_record',
    type: 19,
    enabled: 'O',
    function: 'protect_record',
    args: models[table].schema.columns
      .filter(c => c.immutable)
      .map(c => c.name + '\\000')
      .join(''),
  }));
  requireCondition(
    JSON.stringify(triggers) === JSON.stringify(expected),
    'TRIGGER_CONTRACT_MISMATCH'
  );
  const policies = await db.any(
    `SELECT tablename AS table,policyname AS name,permissive,array_to_string(roles,',') AS roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='app' ORDER BY tablename,policyname`
  );
  requireCondition(
    JSON.stringify(policies) ===
      JSON.stringify(
        [...order].sort().map(table => ({
          table,
          name: 'tenant_isolation',
          permissive: 'PERMISSIVE',
          roles: 'public',
          cmd: 'ALL',
          qual: TENANT_POLICY_EXPRESSION,
          with_check: TENANT_POLICY_EXPRESSION,
        }))
      ),
    'POLICY_CONTRACT_MISMATCH'
  );
  const ledger = await db.any(
    'SELECT module_name,migration_id,hash FROM app.schema_migrations ORDER BY module_name,migration_id'
  );
  const wanted = modules
    .filter(m => m.schema === 'app')
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
  // Build the expected catalog from runtime models inside a rolled-back transaction.
  const scratch = 'verify_' + randomUUID().replaceAll('-', '');
  const rollback = new Error('verification rollback');
  try {
    await db.tx(async tx => {
      await tx.none('CREATE SCHEMA $1:name', [scratch]);
      for (const table of order) {
        const definition = structuredClone(models[table].schema);
        definition.dbSchema = scratch;
        for (const fk of definition.constraints.foreignKeys ?? [])
          if (fk.references.schema === 'app') fk.references.schema = scratch;
        await new TableModel(tx, pgp, definition).createTable();
      }
      requireCondition(
        (await catalog(tx, 'app', order)) ===
          (await catalog(tx, scratch, order)),
        'CATALOG_CONTRACT_MISMATCH'
      );
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
