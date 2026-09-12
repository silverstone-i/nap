import { ProvisioningError } from './config.mjs';
/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createDb } from 'pg-schemata';
import { roleUrl } from './config.mjs';

/** Does: Creates a maintenance pool with silent driver logging and bounded connections. Called by: provisioning scripts. */
export function database(connectionString) {
  return createDb({
    connectionString,
    pool: { connectionTimeoutMillis: 5000, statement_timeout: 15000 },
    logger: { debug() {}, info() {}, warn() {}, error() {} },
  });
}
/** Does: Executes an operation and always closes its PostgreSQL pool. Called by: setup and verification. */
export async function using(url, operation) {
  const db = database(url);
  try {
    return await operation(db);
  } finally {
    await db.close();
  }
}
/** Does: Configures the fixed owner/runtime roles and verifies supplied passwords. Called by: local and Render setup with infrastructure credentials. */
export async function prepareRoles(url, entry) {
  await using(url, async db => {
    for (const [role, password] of [
      ['nap_admin', entry.adminPassword],
      ['nap_app', entry.appPassword],
    ]) {
      const row = await db.oneOrNone(
        `SELECT rolname,rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin
   OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS unsafe FROM pg_roles r WHERE rolname=$1`,
        [role]
      );
      if (row?.unsafe)
        throw new ProvisioningError(
          'Existing database role has incompatible privileges'
        );
      if (role === 'nap_app' && row) {
        const owns = await db.one(
          "SELECT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=(SELECT oid FROM pg_roles WHERE rolname=$1) AND deptype='o') AS owns",
          [role]
        );
        if (owns.owns)
          throw new ProvisioningError('Runtime role owns database objects');
      }
      if (row) {
        const probe = new URL(url);
        probe.username = role;
        probe.password = encodeURIComponent(password);
        await using(probe.href, d => d.one('SELECT 1'));
      }
    }
    for (const [role, password] of [
      ['nap_admin', entry.adminPassword],
      ['nap_app', entry.appPassword],
    ]) {
      if (
        !(await db.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await db.none(
          'CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT PASSWORD $2',
          [role, password]
        );
    }
  });
}
/** Does: Creates a missing local database or verifies its saved ownership marker. Called by: local setup after saving creation intent. */
export async function createLocal(url, entry, save) {
  await using(url, async db => {
    const found = await db.oneOrNone(
      "SELECT pg_get_userbyid(datdba) AS owner,shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [entry.database]
    );
    if (found) {
      if (
        found.owner === 'nap_admin' &&
        found.marker === null &&
        entry.createConfirmed
      ) {
        await db.none('COMMENT ON DATABASE $1:name IS $2', [
          entry.database,
          `nap:${entry.operationId}`,
        ]);
        return;
      }
      if (
        found.owner !== 'nap_admin' ||
        found.marker !== `nap:${entry.operationId}`
      )
        throw new ProvisioningError(
          'Existing database is not owned by this provisioning operation'
        );
      return;
    }
    if (entry.createRequested)
      throw new ProvisioningError(
        'Uncertain database creation; inspect the saved operation before retrying'
      );
    entry.createRequested = true;
    await save();
    await db.none('CREATE DATABASE $1:name OWNER nap_admin', [entry.database]);
    entry.createConfirmed = true;
    await save();
    await db.none('COMMENT ON DATABASE $1:name IS $2', [
      entry.database,
      `nap:${entry.operationId}`,
    ]);
  });
}
/** Does: Removes public creation privileges and grants restricted database access. Called by: setup after physical creation. */
export async function databasePrivileges(infrastructureUrl, entry) {
  const url = new URL(infrastructureUrl);
  url.pathname = '/' + entry.database;
  await using(url.href, async db => {
    const owner = await db.one(
      'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()'
    );
    if (owner.owner !== 'nap_admin') {
      if (!entry.renderId)
        throw new ProvisioningError('Incompatible database owner');
      const current = await db.one('SELECT current_user AS name');
      await db.none('GRANT nap_admin TO $1:name', [current.name]);
      try {
        await db.none('ALTER DATABASE $1:name OWNER nap_admin', [
          entry.database,
        ]);
      } finally {
        await db.none('REVOKE nap_admin FROM $1:name', [current.name]);
      }
    }
    await db.none(
      'REVOKE ALL ON DATABASE $1:name FROM PUBLIC; GRANT CONNECT ON DATABASE $1:name TO nap_app,nap_admin; REVOKE CREATE ON SCHEMA public FROM PUBLIC',
      [entry.database]
    );
  });
}
/** Does: Records or checks a physical cell UUID before application migrations. Called by: cell setup and all later cell operations. */
export async function identity(db, entry, environment, create = false) {
  const present = await db.one(
    "SELECT to_regclass('cell.physical_identity') IS NOT NULL AS present"
  );
  if (!present.present) {
    if (!create) throw new ProvisioningError('Missing physical cell identity');
    await db.tx(async tx => {
      await tx.none(`CREATE SCHEMA cell AUTHORIZATION nap_admin;
   REVOKE ALL ON SCHEMA cell FROM PUBLIC;
   CREATE TABLE cell.physical_identity(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),id uuid NOT NULL,environment text NOT NULL,database_name text NOT NULL,operation_id uuid NOT NULL);
   CREATE FUNCTION cell.guard_physical_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable cell identity'; END $$;
   CREATE TRIGGER immutable_identity BEFORE UPDATE OR DELETE ON cell.physical_identity FOR EACH ROW EXECUTE FUNCTION cell.guard_physical_identity();`);
      await tx.none(
        'INSERT INTO cell.physical_identity(id,environment,database_name,operation_id) VALUES($1,$2,$3,$4)',
        [entry.id, environment, entry.database, entry.operationId]
      );
      await tx.none(
        'GRANT USAGE ON SCHEMA cell TO nap_app; GRANT SELECT ON cell.physical_identity TO nap_app'
      );
    });
  }
  const row = await db.one(
    'SELECT *,current_database() AS actual FROM cell.physical_identity'
  );
  if (
    row.id !== entry.id ||
    row.environment !== environment ||
    row.database_name !== entry.database ||
    row.actual !== entry.database ||
    row.operation_id !== entry.operationId
  )
    throw new ProvisioningError('Physical cell identity mismatch');
}
/** Does: Builds the saved maintenance connection. Called by: migration, seed, and activation. */
export function maintenanceUrl(entry) {
  const value = roleUrl(entry.endpoint, 'nap_admin', entry.adminPassword);
  if (decodeURIComponent(new URL(value).pathname.slice(1)) !== entry.database)
    throw new ProvisioningError('Saved endpoint database mismatch');
  return value;
}
