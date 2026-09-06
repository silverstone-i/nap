/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  loadLocalEnvironment,
  resolveSetupConfiguration,
} from '../apps/api/src/util/env.ts';

const literal = value => "'" + value.replaceAll("'", "''") + "'";
const identifier = value => '"' + value.replaceAll('"', '""') + '"';

function query(connection, sql) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    // Do not forward arbitrary PGOPTIONS, service settings, or startup files.
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

export function setupDatabases(configuration) {
  const { setup, targets } = configuration;
  const roles = [...new Map(targets.map(t => [t.user, t])).values()];
  // Validate all existing objects before making any change.
  for (const role of roles) {
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

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Expected one setup mode: test or development');
    loadLocalEnvironment();
    setupDatabases(resolveSetupConfiguration(process.argv[2]));
    console.log('Development/test databases are ready');
  } catch (error) {
    // Only our fixed diagnostics escape; never emit subprocess output or a URL.
    console.error(
      error instanceof Error ? error.message : 'Database setup failed'
    );
    process.exitCode = 1;
  }
}
