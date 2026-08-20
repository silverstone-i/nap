/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { DbConnection } from 'pg-schemata';

import type { CellDatabase } from './createCellDb.js';

/** A cell transaction carrying an established tenant context. */
export type CellTransaction = DbConnection;

/** Raised when a tenant context cannot be established. */
export class TenantContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantContextError';
  }
}

/**
 * Accepts only the canonical dashed UUID form, which is narrower than the
 * `uuid` input type: PostgreSQL also parses brace-wrapped and undashed
 * variants. A tenant id is client-supplied, so it is held to one shape
 * rather than every shape the database would tolerate, and validating here
 * keeps it from reaching the database at all (ARCH-022).
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs tenant-owned work inside a cell transaction scoped to one tenant.
 *
 * This is the only general entry point for tenant-owned queries, and it is the
 * same one workers, imports, reports, and tests use (ARCH-020).
 *
 * @param cellDb - The cell handle that owns the connection.
 * @param tenantId - Tenant whose rows the work may touch.
 * @param work - Callback receiving the tenant-scoped transaction.
 * @returns Whatever `work` resolves to.
 * @throws {TenantContextError} If `tenantId` is not a UUID, or if `work`
 *   returns the transaction itself.
 */
export async function withTenantTransaction<T>(
  cellDb: CellDatabase,
  tenantId: string,
  work: (tx: CellTransaction) => Promise<T>
): Promise<T> {
  if (typeof tenantId !== 'string' || !UUID_PATTERN.test(tenantId)) {
    throw new TenantContextError('tenantId must be a UUID');
  }

  return cellDb.tx(async tx => {
    // PostgreSQL does not accept a bind parameter in `SET`, so the
    // transaction-local assignment is written as set_config(..., true).
    // That is `SET LOCAL` semantics with a parameterized value: the setting
    // is discarded at commit or rollback and never outlives the connection's
    // return to the pool (ARCH-018).
    await tx.one('SELECT set_config($1, $2, true)', [
      'nap.tenant_id',
      tenantId,
    ]);

    const result = await work(tx);

    // The context dies with the transaction, so handing the transaction back
    // to the caller would produce a handle that silently stops being
    // tenant-scoped. Repositories bound to `tx` are subject to the same rule;
    // this catches the case that can be checked.
    if ((result as unknown) === tx) {
      throw new TenantContextError(
        'work() must not return the tenant transaction'
      );
    }

    return result;
  });
}
