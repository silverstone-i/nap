/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { DbConnection } from 'pg-schemata';
import type { AdminDatabase } from './admin/index.js';

/**
 * Does: Types the transaction handed to an admin callback: the query
 * executor plus the repositories registered on the admin database.
 * Used by: withAdminTransaction and the callbacks passed to it.
 * Why: it is valid only inside the callback; the transaction ends when the
 * callback returns.
 */
export type AdminTransaction<R = Record<never, never>> = DbConnection & R;

/**
 * Does: Runs a callback inside one transaction on the central admin
 * database and returns whatever the callback returns.
 * Called by: framework handlers of an admin-targeted router, and any service
 * doing control-plane work.
 * Why: the admin database holds no tenant rows, so no tenant setting is
 * applied; the framework HTTP contract says an admin-targeted controller
 * has no tenant context. If the callback throws, the transaction rolls back
 * and the error propagates. Returning the transaction itself is detected and
 * rejected, as withTenantTransaction does, so a transaction cannot outlive
 * its callback.
 */
export async function withAdminTransaction<T, R = Record<never, never>>(
  adminDb: AdminDatabase<R>,
  work: (tx: AdminTransaction<R>) => Promise<T>
): Promise<T> {
  return adminDb.transaction(async tx => {
    // pg-schemata's extend hook binds this handle's repositories to every
    // transaction, but its transaction signature erases that repository type.
    const result = await work(tx as AdminTransaction<R>);
    if (result === tx)
      throw new Error('Admin transaction must not escape its callback');
    return result;
  });
}
