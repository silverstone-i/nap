/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Scope a transaction to one tenant for the cell `app` row-level security
 * rule (M0002-01-R006). `set_config(..., true)` is `SET LOCAL` with a bind
 * parameter, so the setting ends with the transaction.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
export async function setTenant(tx, tenantId) {
  await tx.one("SELECT set_config('nap.tenant_id', $1, true)", [tenantId]);
}

/**
 * Run `operation` in a cell transaction scoped to `tenantId`. Every read or
 * write of a tenant business table in a cell goes through here: without the
 * setting the row-level security rule returns no rows and rejects writes.
 * @param {{tx: Function}} db Cell repository handle (`handle.db`).
 * @param {string} tenantId
 * @param {(tx: import('pg-promise').IDatabase<unknown>) => Promise<T>} operation
 * @returns {Promise<T>}
 * @template T
 */
export function withTenantTransaction(db, tenantId, operation) {
  return db.tx(async tx => {
    await setTenant(tx, tenantId);
    return operation(tx);
  });
}
