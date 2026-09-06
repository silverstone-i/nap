/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it, vi } from 'vitest';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';

it.each([
  '',
  'not-a-uuid',
  "'; SELECT 1; --",
  ' 00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001 ',
])(
  'rejects malformed tenant input before opening a transaction: %s',
  async tenant => {
    const db = createCellDatabase('postgres://unused:unused@127.0.0.1/unused');
    const transaction = vi.spyOn(db, 'transaction');
    const work = vi.fn(() => Promise.resolve('unused'));
    try {
      await expect(withTenantTransaction(db, tenant, work)).rejects.toThrow(
        'Tenant ID must be a UUID'
      );
      expect(transaction).not.toHaveBeenCalled();
      expect(work).not.toHaveBeenCalled();
    } finally {
      await db.close();
    }
  }
);

it('keeps admin handles outside the tenant helper type contract', () => {
  // Typechecked without constructing a pool or attempting a database operation.
  if (false) {
    const admin = createAdminDatabase('unused');
    void withTenantTransaction(
      // @ts-expect-error Admin handles do not carry the cell identity.
      admin,
      '00000000-0000-4000-8000-000000000001',
      () => Promise.resolve(null)
    );
  }
  expect(true).toBe(true);
});

it('installs parameterized local context before invoking work on the transaction', async () => {
  const db = createCellDatabase('postgres://unused:unused@127.0.0.1/unused');
  const tenant = '00000000-0000-4000-8000-000000000001';
  const events: string[] = [];
  const query = vi.spyOn(db.db, 'one').mockImplementation(() => {
    events.push('context');
    return Promise.resolve({ set_config: tenant });
  });
  vi.spyOn(db, 'transaction').mockImplementation(async work => {
    events.push('transaction');
    return work(db.db);
  });
  try {
    expect(
      await withTenantTransaction(db, tenant, tx => {
        events.push('work');
        expect(tx).toBe(db.db);
        return Promise.resolve(42);
      })
    ).toBe(42);
    expect(events).toEqual(['transaction', 'context', 'work']);
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "SELECT set_config('nap.tenant_id', $1, true)",
      [tenant]
    );
    query.mockRejectedValueOnce(new Error('context failed'));
    const work = vi.fn(() => Promise.resolve(null));
    await expect(withTenantTransaction(db, tenant, work)).rejects.toThrow(
      'context failed'
    );
    expect(work).not.toHaveBeenCalled();
  } finally {
    vi.restoreAllMocks();
    await db.close();
  }
});
