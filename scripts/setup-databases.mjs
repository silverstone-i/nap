/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Creates the local or CI databases for one environment, plus the
 * least-privileged runtime role the API connects as.
 *
 * Idempotent: re-running it converges rather than failing. It creates exactly
 * what ADR 0004 requires — one central administration database and one cell
 * database, separate from the first release even on a shared instance — and a
 * runtime role that owns nothing and cannot bypass RLS.
 *
 *   npm run db:setup:test
 *   npm run db:setup:dev
 *
 * It does not apply migrations; those are separate release operations
 * (npm run db:migrate:admin / db:migrate:cell).
 */

import { existsSync } from 'node:fs';
import pgPromise from 'pg-promise';

const ENV_FILE = 'apps/api/.env';
if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/**
 * Reads a required environment variable.
 *
 * @param {string} name - Variable name.
 * @returns {string} The value.
 */
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * Splits a PostgreSQL URL into the parts this script needs. Values are used
 * locally and never logged.
 *
 * @param {string} url - A postgres:// connection string.
 * @returns {{database: string, user: string, password: string}} Parsed parts.
 */
function parse(url) {
  const parsed = new URL(url);
  return {
    database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

const SUFFIXES = { development: 'DEV', test: 'TEST' };

const environment = process.argv[2] ?? 'test';
const suffix = SUFFIXES[environment];
if (!suffix) {
  throw new Error('Usage: setup-test-databases.mjs [test|development]');
}

const pgp = pgPromise();
const setupUrl = required(`SETUP_ADMIN_URL_${suffix}`);
const admin = parse(required(`ADMIN_MIGRATION_URL_${suffix}`));
const cell = parse(required(`CELL_MIGRATION_URL_${suffix}`));
const runtime = parse(required(`CELL_DATABASE_URL_${suffix}`));

const db = pgp(setupUrl);

try {
  const roleExists = await db.oneOrNone(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [runtime.user]
  );

  if (roleExists) {
    // A role created by someone else cannot be altered without the ADMIN
    // option on it. That is a local-machine situation, not a defect: verify
    // the attributes instead of failing, and say what is left to do.
    try {
      await db.none('ALTER ROLE $1:name WITH LOGIN PASSWORD $2', [
        runtime.user,
        runtime.password,
      ]);
      // Stated rather than assumed: these are the attributes the runtime role
      // must not have, and a role reused from an earlier experiment may have
      // them.
      await db.none(
        'ALTER ROLE $1:name NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION',
        [runtime.user]
      );
      console.log(`role ${runtime.user}: ready`);
    } catch (error) {
      if (error?.code !== '42501') throw error;

      const attributes = await db.one(
        'SELECT rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
        [runtime.user]
      );

      if (attributes.rolsuper || attributes.rolbypassrls) {
        throw new Error(
          `Role ${runtime.user} holds SUPERUSER or BYPASSRLS and cannot be ` +
            'used as a runtime role. Fix it as a superuser, or point ' +
            `CELL_DATABASE_URL_${suffix} at a different role.`,
          { cause: error }
        );
      }

      console.log(
        `role ${runtime.user}: exists and is least-privileged, but this ` +
          'connection may not alter it. Its password must already match ' +
          `CELL_DATABASE_URL_${suffix}.`
      );
    }
  } else {
    await db.none(
      'CREATE ROLE $1:name WITH LOGIN PASSWORD $2 ' +
        'NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION',
      [runtime.user, runtime.password]
    );
    console.log(`role ${runtime.user}: created`);
  }

  for (const target of [admin, cell]) {
    const exists = await db.oneOrNone(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [target.database]
    );

    if (!exists) {
      // CREATE DATABASE cannot run inside a transaction block.
      await db.none('CREATE DATABASE $1:name OWNER $2:name', [
        target.database,
        target.user,
      ]);
    }

    await db.none('REVOKE ALL ON DATABASE $1:name FROM PUBLIC', [
      target.database,
    ]);
    await db.none('GRANT CONNECT ON DATABASE $1:name TO $2:name', [
      target.database,
      runtime.user,
    ]);
    console.log(`database ${target.database}: ready (owner ${target.user})`);
  }
} finally {
  await db.$pool.end();
  pgp.end();
}
