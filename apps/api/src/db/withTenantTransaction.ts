/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import type { DbConnection } from 'pg-schemata';
import type { CellDatabase } from './cell/index.js';

/** Executor and repositories valid only inside a tenant callback. */
export type CellTransaction<R = Record<never, never>> = DbConnection & R;
const tenantUuid = z.uuid();

/**
 * Run tenant business work from requests, jobs, imports, or reports in one
 * isolated cell transaction. The caller supplies a server-resolved tenant UUID.
 * Invalid UUIDs fail before database access; work failures roll back and propagate.
 * Return detached values only: never retain or return the transaction or its
 * repositories. Identity escape is checked; repository escape is a review boundary.
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
