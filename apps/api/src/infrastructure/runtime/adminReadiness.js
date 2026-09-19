/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from '../../modules/admin-tenancy/repositories.js';

/**
 * Report whether the runtime connection is safe to serve traffic.
 *
 * In one transaction with a 5 second statement timeout, confirms the
 * session is `nap-app` with no elevated attributes, memberships, owned
 * objects, or CREATE rights anywhere, and that every admin table grants it
 * SELECT, INSERT, UPDATE, and DELETE. Any error reports not ready.
 * @param {import('pg-schemata').Database} handle Connected handle.
 * @returns {Promise<boolean>}
 */
export async function checkAdminReadiness(handle) {
  try {
    return await handle.db.tx(async tx => {
      await tx.one("SELECT set_config('statement_timeout','5000',true)");
      const role =
        await tx.one(`SELECT session_user='nap-app' AND current_user='nap-app' AND rolcanlogin
        AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication)
        AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid)
        AND NOT EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid=r.oid AND deptype='o')
        AND NOT has_database_privilege(current_user,current_database(),'CREATE')
        AND NOT has_database_privilege(current_user,current_database(),'TEMP')
        AND NOT EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' AND has_schema_privilege(current_user,n.oid,'CREATE')) AS safe
        FROM pg_roles r WHERE rolname=current_user`);
      if (!role.safe) return false;
      const tables = await tx.any(
        `SELECT c.relname,(has_table_privilege(current_user,c.oid,'SELECT') AND has_table_privilege(current_user,c.oid,'INSERT') AND has_table_privilege(current_user,c.oid,'UPDATE') AND has_table_privilege(current_user,c.oid,'DELETE')) AS accessible FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='admin' AND c.relkind='r' AND c.relname=ANY($1)`,
        [Object.keys(repositories)]
      );
      return (
        tables.length === Object.keys(repositories).length &&
        tables.every(t => t.accessible)
      );
    });
  } catch {
    return false;
  }
}
