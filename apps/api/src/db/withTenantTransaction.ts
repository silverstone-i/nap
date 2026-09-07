/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import type { DbConnection } from 'pg-schemata';
import type { CellDatabase } from './cell/index.js';

/**
 * Does: Types the transaction handed to a tenant callback: the query
 * executor plus the repositories registered on the cell database.
 * Used by: withTenantTransaction and the callbacks passed to it.
 * Why: it is valid only inside the callback; the transaction ends when the
 * callback returns.
 */
export type CellTransaction<R = Record<never, never>> = DbConnection & R;
const tenantUuid = z.uuid();

/**
 * Does: Runs a callback inside one database transaction that can only see
 * the given tenant's rows, and returns whatever the callback returns.
 * Called by: any code doing tenant business work: request handlers, jobs,
 * imports, reports, and the tenant-isolation tests.
 * Why: the tenant ID is set as a transaction-local setting that the
 * database's row filters read, so every query in the callback is scoped to
 * that tenant without each query saying so. The tenant ID must be one the
 * server resolved, never one taken from the client, and it must be a UUID
 * or the call fails before touching the database. If the callback throws,
 * the transaction rolls back and the error propagates. Do not return or
 * keep the transaction or its repositories: returning the transaction
 * itself is detected and rejected; returning a repository is left to review.
 */
export async function withTenantTransaction<T, R = Record<never, never>>(
  cellDb: CellDatabase<R>,
  tenantId: string,
  work: (tx: CellTransaction<R>) => Promise<T>
): Promise<T> {
  if (!tenantUuid.safeParse(tenantId).success)
    throw new Error('Tenant ID must be a UUID');
  return cellDb.transaction(async tx => {
    await tx.one("SELECT set_config('nap.tenant_id', $1, true)", [tenantId]);
    // pg-schemata's extend hook binds this handle's repositories to every
    // transaction, but its transaction signature erases that repository type.
    const result = await work(tx as CellTransaction<R>);
    if (result === tx)
      throw new Error('Tenant transaction must not escape its callback');
    return result;
  });
}
