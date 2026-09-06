/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CellDatabase } from '../../src/db/cell/index.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import type { CellTransaction } from '../../src/db/withTenantTransaction.js';

/** Minimal operation adapters let each model exercise its own query surface. */
export type IsolationOperations<R> = {
  read: (tx: CellTransaction<R>) => Promise<{ id: string }[]>;
  insert: (
    tx: CellTransaction<R>,
    tenantId: string,
    id: string,
    code: string
  ) => Promise<{ id: string }>;
  update: (tx: CellTransaction<R>, id: string) => Promise<unknown>;
  remove: (tx: CellTransaction<R>, id: string) => Promise<number>;
  relate: (
    tx: CellTransaction<R>,
    tenantId: string,
    id: string,
    parentId: string
  ) => Promise<{ id: string }>;
};

/**
 * Register isolation checks for a tenant-owned model or SQL adapter. Setup owns
 * disposable migrations/grants; the harness seeds tenants through runtime access.
 * Each expected SQL failure gets its own transaction to avoid aborted-state errors.
 */
export function registerTenantIsolationSuite<R>(
  name: string,
  options: {
    setup: () => Promise<CellDatabase<R>>;
    cleanup: () => Promise<void>;
    operations: IsolationOperations<R>;
  }
) {
  describe(name, () => {
    const a = randomUUID(),
      b = randomUUID(),
      unmatched = randomUUID();
    let aId: string, bId: string;
    let db: CellDatabase<R>;
    const op = options.operations;
    beforeAll(async () => {
      db = await options.setup();
      aId = (
        await withTenantTransaction(db, a, tx =>
          op.insert(tx, a, randomUUID(), 'shared')
        )
      ).id;
      bId = (
        await withTenantTransaction(db, b, tx =>
          op.insert(tx, b, randomUUID(), 'shared')
        )
      ).id;
    }, 30000);
    afterAll(options.cleanup, 30000);

    it('reads only the active tenant without application tenant predicates', async () => {
      for (const [tenant, id] of [
        [a, aId],
        [b, bId],
      ] as const)
        expect(await withTenantTransaction(db, tenant, op.read)).toEqual([
          expect.objectContaining({ id }),
        ]);
    });
    it('rejects cross-tenant inserts and tenant-local duplicate natural keys', async () => {
      await expect(
        withTenantTransaction(db, a, tx =>
          op.insert(tx, b, randomUUID(), 'foreign')
        )
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        withTenantTransaction(db, a, tx =>
          op.insert(tx, a, randomUUID(), 'shared')
        )
      ).rejects.toMatchObject({ code: '23505' });
    });
    it('does not update or delete another tenant row', async () => {
      expect(
        await withTenantTransaction(db, a, tx => op.update(tx, bId))
      ).toBeNull();
      expect(await withTenantTransaction(db, a, tx => op.remove(tx, bId))).toBe(
        0
      );
      expect(await withTenantTransaction(db, b, op.read)).toEqual([
        expect.objectContaining({ id: bId }),
      ]);
    });
    it('allows same-tenant CRUD and relationships but rejects foreign parents', async () => {
      await expect(
        withTenantTransaction(db, a, tx => op.relate(tx, a, randomUUID(), bId))
      ).rejects.toMatchObject({ code: '23503' });
      const { id: child } = await withTenantTransaction(db, a, tx =>
        op.relate(tx, a, randomUUID(), aId)
      );
      expect(
        await withTenantTransaction(db, a, tx => op.update(tx, child))
      ).not.toBeNull();
      expect(
        await withTenantTransaction(db, a, tx => op.remove(tx, child))
      ).toBe(1);
    });
    it('returns no rows and rejects writes without matching context', async () => {
      expect(
        await db.transaction(tx => op.read(tx as CellTransaction<R>))
      ).toEqual([]);
      // As in the helper, pg-schemata binds repositories but erases their types.
      await db.transaction(async tx => {
        await tx.one("SELECT set_config('nap.tenant_id', '', true)");
        expect(await op.read(tx as CellTransaction<R>)).toEqual([]);
      });
      expect(await withTenantTransaction(db, unmatched, op.read)).toEqual([]);
      await expect(
        db.transaction(tx =>
          op.insert(tx as CellTransaction<R>, a, randomUUID(), 'missing')
        )
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        withTenantTransaction(db, unmatched, tx =>
          op.insert(tx, a, randomUUID(), 'unmatched')
        )
      ).rejects.toMatchObject({ code: '42501' });
    });
  });
}
