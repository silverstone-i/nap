/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';

/** Quote setup SQL values, escaping apostrophes so values remain SQL data. */
const literal = value => "'" + value.replaceAll("'", "''") + "'";
/** Quote database and role names as SQL identifiers, which use double quotes. */
const identifier = value => '"' + value.replaceAll('"', '""') + '"';

/**
 * Execute a setup SQL statement through psql using the supplied connection fields.
 * Used for catalog checks, role/database creation, grants, and connectivity probes;
 * blocks until the child completes or reaches the 15-second timeout and returns
 * trimmed stdout. Statements may change the connected PostgreSQL instance.
 *
 * Pass credentials through the child environment and SQL through stdin to keep
 * passwords out of command-line arguments. Ignore psql startup files so personal
 * settings cannot alter setup behavior. Suppress diagnostics because they may
 * contain credentials; successful query output can also be sensitive.
 * @throws A fixed error if psql cannot start, times out, or exits unsuccessfully.
 */
function query(connection, sql) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    // Supply only the intended connection settings so inherited PostgreSQL
    // options cannot redirect setup. Literal quoting relies on backslashes
    // remaining literal, so explicitly enable standard_conforming_strings.
    env: {
      PATH: process.env.PATH,
      PGHOST: connection.host,
      PGPORT: connection.port,
      PGUSER: connection.user,
      PGPASSWORD: connection.password,
      PGDATABASE: connection.database,
      PGCONNECT_TIMEOUT: '5',
      PGCLIENTENCODING: 'UTF8',
      PGOPTIONS: '-c standard_conforming_strings=on',
    },
    input: sql,
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'Database setup command failed; check PostgreSQL availability, credentials, and client installation'
    );
  return result.stdout.trim();
}

/**
 * Prepare databases for local development and CI through db:setup:dev/test.
 * Create missing databases and runtime roles, grant CONNECT, and verify access;
 * returns nothing and creates no application schema.
 * Expects configuration validated by resolveSetupConfiguration;
 * callers providing fixtures directly must preserve the same invariants.
 *
 * Existing roles must be unprivileged non-owners with no role memberships, and
 * existing databases must retain the configured migration owner. Reject mismatches
 * rather than resetting passwords or existing data so rerunning setup preserves
 * the developer's environment and does not silently change access privileges.
 *
 * CREATE DATABASE cannot run inside a transaction: a later failure may leave
 * earlier creations in place. Rerunning resumes through the existence checks;
 * this routine is intended for sequential setup, not concurrent provisioning.
 * @throws If preflight validation, creation, grants, or connectivity checks fail.
 */
export function setupDatabases(configuration) {
  const { setup, targets } = configuration;
  const roles = [...new Map(targets.map(t => [t.user, t])).values()];
  // Check existing roles and databases first so a known incompatibility does not
  // leave newly created objects behind before setup fails.
  for (const role of roles) {
    // Membership can provide an escalation path even when the role's own flags
    // look safe. Shared dependencies also reveal ownership across databases.
    const state = query(
      setup,
      `SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication OR NOT rolcanlogin
      OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
      OR EXISTS (SELECT 1 FROM pg_shdepend WHERE refclassid = 'pg_authid'::regclass AND refobjid = r.oid AND deptype = 'o')
      FROM pg_roles r WHERE rolname = ${literal(role.user)};`
    );
    if (state === 't')
      throw new Error(
        'Existing runtime role has incompatible privileges or ownership'
      );
    // Authenticate existing roles before making changes; do not silently repair
    // a password mismatch. The setup database must allow this connectivity probe.
    if (state === 'f')
      query({ ...role, database: setup.database }, 'SELECT 1;');
  }
  for (const target of targets) {
    const owner = query(
      setup,
      `SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = ${literal(target.database)};`
    );
    if (owner && owner !== target.owner)
      throw new Error('Existing database has incompatible ownership');
  }
  for (const role of roles) {
    if (
      !query(
        setup,
        `SELECT 1 FROM pg_roles WHERE rolname = ${literal(role.user)};`
      )
    ) {
      query(
        setup,
        `CREATE ROLE ${identifier(role.user)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${literal(role.password)};`
      );
    }
  }
  for (const target of targets) {
    if (
      !query(
        setup,
        `SELECT 1 FROM pg_database WHERE datname = ${literal(target.database)};`
      )
    ) {
      query(
        setup,
        `CREATE DATABASE ${identifier(target.database)} OWNER ${identifier(target.owner)};`
      );
    }
    query(
      setup,
      `GRANT CONNECT ON DATABASE ${identifier(target.database)} TO ${identifier(target.user)};`
    );
    query(target, 'SELECT 1;');
  }
}
