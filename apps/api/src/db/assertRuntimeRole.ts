/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Database } from 'pg-schemata';

/**
 * Does: Checks that the database role this connection runs as cannot bypass
 * row-level security (the per-tenant row filter), own objects, or create
 * roles, databases, or schemas.
 * Called by: the readiness checker on every cycle, at startup and from the
 * readiness endpoint, and by database integration tests.
 * Why: a runtime role with any of those powers could read another tenant's
 * rows or alter the schema, so startup must fail rather than serve. The query
 * follows every role membership, including ones reachable only through SET
 * ROLE, and checks the login role as well as the current role so a
 * connection cannot hide behind SET ROLE. Any query failure is reported with
 * one fixed message so catalog errors never leak detail.
 * @param database Anything with a transaction method; readiness passes its
 * own cancellable probe connection instead of the whole pool.
 * @param timeoutMs Statement timeout for the catalog query, in milliseconds.
 * @throws With a fixed message when the role is unsafe or the check fails.
 */
export async function assertRuntimeRole(
  database: Pick<Database, 'transaction'>,
  timeoutMs = 5000
): Promise<void> {
  try {
    const { unsafe } = await database.transaction(async tx => {
      await tx.one("SELECT set_config('statement_timeout', $1, true)", [
        String(Math.max(1, Math.floor(timeoutMs))),
      ]);
      return tx.one<{ unsafe: boolean }>(`
        WITH RECURSIVE reachable(oid) AS (
          SELECT oid FROM pg_roles WHERE rolname IN (session_user, current_user)
          UNION
          SELECT m.roleid FROM pg_auth_members m JOIN reachable r ON m.member = r.oid
        )
        SELECT EXISTS (
          SELECT 1 FROM reachable x JOIN pg_roles r ON r.oid = x.oid
          WHERE r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR
            r.rolcreatedb OR r.rolreplication OR
            EXISTS (SELECT 1 FROM pg_shdepend d
              WHERE d.refclassid = 'pg_authid'::regclass AND d.refobjid = r.oid
                AND d.deptype = 'o') OR
            has_database_privilege(r.oid, current_database(), 'CREATE') OR
            EXISTS (SELECT 1 FROM pg_namespace n
              WHERE n.nspname !~ '^pg_' AND n.nspname <> 'information_schema'
                AND has_schema_privilege(r.oid, n.oid, 'CREATE'))
        ) AS unsafe`);
    });
    if (unsafe) throw new Error();
  } catch {
    throw new Error('Runtime database role verification failed');
  }
}
