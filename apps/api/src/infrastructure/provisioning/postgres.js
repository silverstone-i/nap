/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { using } from '../runtime/adminDatabase.js';
import { roleUrl } from '../../application/shared/configuration.js';
import {
  requireCondition,
  MaintenanceError,
} from '../../application/shared/errors.js';
/**
 * Verify the `nap-admin` and `nap-app` role attributes on the connected
 * server. `nap-admin` must log in with CREATEDB and CREATEROLE and nothing
 * stronger; `nap-app` must log in with no elevated attributes, memberships,
 * or owned objects.
 * @param {import('pg-promise').IBaseProtocol<unknown>} db
 * @param {boolean} [allowMissing=false] Accept an absent role, used before provider setup creates it.
 * @returns {Promise<void>}
 * @throws {MaintenanceError} `UNSAFE_ADMIN_ROLE` or `UNSAFE_RUNTIME_ROLE`
 */
export async function verifyRoles(db, allowMissing = false) {
  const rows =
    await db.any(`SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS member,
    EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o') AS owns
    FROM pg_roles r WHERE rolname IN ('nap-admin','nap-app')`);
  const admin = rows.find(r => r.rolname === 'nap-admin');
  const app = rows.find(r => r.rolname === 'nap-app');
  requireCondition(
    (allowMissing && !admin) ||
      (admin?.rolcanlogin &&
        admin.rolcreatedb &&
        admin.rolcreaterole &&
        !admin.rolsuper &&
        !admin.rolbypassrls &&
        !admin.rolreplication &&
        !admin.member),
    'UNSAFE_ADMIN_ROLE'
  );
  requireCondition(
    (allowMissing && !app) ||
      (app?.rolcanlogin &&
        !app.rolsuper &&
        !app.rolbypassrls &&
        !app.rolcreatedb &&
        !app.rolcreaterole &&
        !app.rolreplication &&
        !app.member &&
        !app.owns),
    'UNSAFE_RUNTIME_ROLE'
  );
}
/**
 * Verify that `name` is the connected database, is owned by `nap-admin`,
 * grants `nap-app` CONNECT only, and lets PUBLIC create nothing in `public`.
 * @param {import('pg-promise').IBaseProtocol<unknown>} db
 * @param {string} name
 * @returns {Promise<void>}
 * @throws {MaintenanceError} `DATABASE_CONTRACT_MISMATCH` or `PUBLIC_SCHEMA_CREATE`, plus role failures from `verifyRoles`.
 */
export async function verifyDatabase(db, name) {
  await verifyRoles(db);
  const row = await db.one(
    `SELECT pg_get_userbyid(datdba) AS owner, current_database() AS actual,
    has_database_privilege('nap-app', oid, 'CONNECT') AS connect,
    has_database_privilege('nap-app', oid, 'CREATE') AS create, has_database_privilege('nap-app', oid, 'TEMP') AS temp FROM pg_database WHERE datname=$1`,
    [name]
  );
  requireCondition(
    row.owner === 'nap-admin' &&
      row.actual === name &&
      row.connect &&
      !row.create &&
      !row.temp,
    'DATABASE_CONTRACT_MISMATCH'
  );
  const publicCreate = await db.one(
    `SELECT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='public' AND a.grantee=0 AND a.privilege_type='CREATE') AS unsafe`
  );
  requireCondition(!publicCreate.unsafe, 'PUBLIC_SCHEMA_CREATE');
}
/**
 * Apply the database-level grant contract: revoke PUBLIC creation in
 * `public`, revoke CREATE and TEMP from PUBLIC and `nap-app`, and grant
 * `nap-app` CONNECT.
 * @param {import('pg-promise').IBaseProtocol<unknown>} db Connection as `nap-admin`.
 * @param {string} name Database name.
 * @returns {Promise<void>}
 */
export async function configureDatabase(db, name) {
  await db.none(
    'REVOKE CREATE ON SCHEMA public FROM PUBLIC; REVOKE CREATE, TEMP ON DATABASE $1:name FROM PUBLIC, "nap-app"; GRANT CONNECT ON DATABASE $1:name TO "nap-app"',
    [name]
  );
}
/**
 * Create absent `nap-admin` and `nap-app` roles using a hosting provider's
 * own credentials, verify existing ones by logging in, and move a
 * provider-owned database to `nap-admin`.
 * @param {string} connection Provider connection string for the target database.
 * @param {{database: string, endpoint: string, adminPassword: string, appPassword: string}} config
 * @returns {Promise<void>}
 * @throws {MaintenanceError} `DATABASE_OWNER_MISMATCH` or role verification failures; a wrong saved password surfaces as a connection failure.
 */
export async function prepareProviderRoles(connection, config) {
  await using(connection, async db => {
    await verifyRoles(db, true);
    const owner = await db.one(
      'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
      [config.database]
    );
    const provider = decodeURIComponent(new URL(connection).username);
    requireCondition(
      [provider, 'nap-admin'].includes(owner.owner),
      'DATABASE_OWNER_MISMATCH'
    );
    // Validate existing roles and passwords before adding missing ones.
    for (const [role, password] of [
      ['nap-admin', config.adminPassword],
      ['nap-app', config.appPassword],
    ]) {
      const exists = await db.oneOrNone(
        'SELECT 1 FROM pg_roles WHERE rolname=$1',
        [role]
      );
      if (exists)
        await using(roleUrl(config.endpoint, role, password), d =>
          d.one('SELECT 1')
        );
    }
    for (const [role, password, attributes] of [
      ['nap-admin', config.adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', config.appPassword, 'NOCREATEDB NOCREATEROLE NOINHERIT'],
    ]) {
      if (
        !(await db.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await db.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION ${attributes} PASSWORD $2`,
          [role, password]
        );
    }
    await verifyRoles(db);
    if (owner.owner === provider) {
      await db.none('GRANT "nap-admin" TO $1:name', [provider]);
      await db.none('ALTER DATABASE $1:name OWNER TO "nap-admin"', [
        config.database,
      ]);
    }
  });
}
/**
 * Create or verify the admin database on a local PostgreSQL server.
 *
 * Holds an advisory lock keyed by database name while checking roles and
 * ownership and creating the database when absent, then applies and
 * verifies the grant contract and confirms `nap-app` can connect. Existing
 * rows and credentials are never changed.
 * @param {{database: string, endpoint: string, maintenance: string, adminPassword: string, appPassword: string}} config
 * @returns {Promise<{status: 'created'|'unchanged', database: string}>}
 * @throws {MaintenanceError} With `created` set to the database name when creation succeeded before a later step failed.
 */
export async function setupLocal(config) {
  let created = false;
  try {
    await using(
      roleUrl(config.maintenance, 'nap-admin', config.adminPassword),
      async pool =>
        pool.task(async db => {
          await db.one('SELECT pg_advisory_lock(hashtext($1))', [
            config.database,
          ]);
          try {
            await verifyRoles(db);
            await using(
              roleUrl(config.maintenance, 'nap-app', config.appPassword),
              d => d.one('SELECT 1')
            );
            const row = await db.oneOrNone(
              'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
              [config.database]
            );
            requireCondition(
              !row || row.owner === 'nap-admin',
              'DATABASE_OWNER_MISMATCH'
            );
            if (!row) {
              await db.none('CREATE DATABASE $1:name OWNER "nap-admin"', [
                config.database,
              ]);
              created = true;
            }
          } finally {
            await db.one('SELECT pg_advisory_unlock(hashtext($1))', [
              config.database,
            ]);
          }
        })
    );
    await using(
      roleUrl(config.endpoint, 'nap-admin', config.adminPassword),
      async db => {
        await configureDatabase(db, config.database);
        await verifyDatabase(db, config.database);
      }
    );
    await using(roleUrl(config.endpoint, 'nap-app', config.appPassword), d =>
      d.one('SELECT 1')
    );
    return {
      status: created ? 'created' : 'unchanged',
      database: config.database,
    };
  } catch (error) {
    const safe =
      error instanceof MaintenanceError
        ? error
        : new MaintenanceError('SETUP_FAILED');
    safe.created = created ? config.database : undefined;
    throw safe;
  }
}
