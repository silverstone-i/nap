/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';

import type { CellDatabase } from '../../src/db/cell/createCellDb.js';
import {
  TenantContextError,
  withTenantTransaction,
} from '../../src/db/cell/withTenantTransaction.js';

interface RecordedCall {
  query: string;
  values: unknown;
}

/**
 * Builds a cell handle stand-in that records the statements a transaction
 * runs, so the ordering contract can be asserted without a database.
 *
 * @returns The stub handle and the calls it recorded.
 */
function stubCellDb(): { cellDb: CellDatabase; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const tx = {
    one: vi.fn((query: string, values: unknown) => {
      calls.push({ query, values });
      return Promise.resolve({});
    }),
    any: vi.fn((query: string, values: unknown) => {
      calls.push({ query, values });
      return Promise.resolve([]);
    }),
  };

  const cellDb = {
    tx: (work: (executor: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as CellDatabase;

  return { cellDb, calls };
}

describe('withTenantTransaction', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001';

  it('sets the tenant context before the work runs', async () => {
    const { cellDb, calls } = stubCellDb();

    await withTenantTransaction(cellDb, tenantId, async tx => {
      await tx.any('SELECT 1');
      return null;
    });

    expect(calls).toHaveLength(2);
    expect(calls[0].query).toContain('set_config');
    // Transaction-local, and parameterized: the tenant value is never
    // interpolated into the statement.
    expect(calls[0].query).toContain('true');
    expect(calls[0].values).toEqual(['nap.tenant_id', tenantId]);
    expect(calls[1].query).toBe('SELECT 1');
  });

  it('rejects a non-UUID tenant before opening a transaction', async () => {
    const { cellDb, calls } = stubCellDb();
    const work = vi.fn();

    await expect(
      withTenantTransaction(cellDb, "not-a-uuid'; --", work)
    ).rejects.toBeInstanceOf(TenantContextError);

    expect(work).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('rejects an empty tenant', async () => {
    const { cellDb } = stubCellDb();

    await expect(
      withTenantTransaction(cellDb, '', () => Promise.resolve(null))
    ).rejects.toBeInstanceOf(TenantContextError);
  });

  it('refuses to hand the transaction back to the caller', async () => {
    const { cellDb } = stubCellDb();

    await expect(
      withTenantTransaction(cellDb, tenantId, tx => Promise.resolve(tx))
    ).rejects.toBeInstanceOf(TenantContextError);
  });
});
