/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Database } from 'pg-schemata';

/**
 * Refuse a runtime connection that can bypass isolation or acquire ownership.
 * Walk every membership, including NOINHERIT/SET ROLE paths, conservatively:
 * deployment roles must not belong to privileged or owning groups. Inspect the
 * login as well as current role so a connection cannot hide behind SET ROLE.
 * Catalog failures propagate as fixed diagnostics and therefore fail startup.
 */
export async function assertRuntimeRole(database: Database): Promise<void> {
  try {
    const { unsafe } = await database.transaction(async tx => {
      await tx.none("SET LOCAL statement_timeout = '5s'");
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
