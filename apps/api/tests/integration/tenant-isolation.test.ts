/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { cellModules } from '../../src/db/cell/modules.js';
import { assertRuntimeRole } from '../../src/db/assertRuntimeRole.js';
import { isolationDatabase } from '../fixtures/isolationDatabase.js';
import { isolationModules } from '../fixtures/isolationMigrations.js';
import { registerTenantIsolationSuite } from '../fixtures/tenantIsolationHarness.js';
import type { IsolationOperations } from '../fixtures/tenantIsolationHarness.js';
import type { IsolationProbe, ProbeRow } from '../fixtures/isolationProbe.js';

type Repositories = { probe: IsolationProbe };
const model: IsolationOperations<Repositories> = {
  read: tx => tx.probe.findAll(),
  insert: (tx, tenant_id, id, code) =>
    tx.probe.insert({ id, tenant_id, code, payload: '' }),
  update: (tx, id) => tx.probe.update(id, { payload: 'updated' }),
  remove: (tx, id) => tx.probe.delete(id),
  relate: (tx, tenant_id, id, parent_id) =>
    tx.probe.insert({ id, tenant_id, parent_id, code: id, payload: '' }),
};
const sql: IsolationOperations<Repositories> = {
  read: tx => tx.any<ProbeRow>('SELECT * FROM app.isolation_probe'),
  insert: (tx, tenant, id, code) =>
    tx.one<{ id: string }>(
      'INSERT INTO app.isolation_probe (id, tenant_id, code) VALUES ($1, $2, $3) RETURNING id',
      [id, tenant, code]
    ),
  update: (tx, id) =>
    tx.oneOrNone(
      "UPDATE app.isolation_probe SET payload = 'updated' WHERE id = $1 RETURNING *",
      [id]
    ),
  remove: async (tx, id) =>
    (await tx.result('DELETE FROM app.isolation_probe WHERE id = $1', [id]))
      .rowCount,
  relate: (tx, tenant, id, parent) =>
    tx.one<{ id: string }>(
      'INSERT INTO app.isolation_probe (id, tenant_id, code, parent_id) VALUES ($1, $2, $1::text, $3) RETURNING id',
      [id, tenant, parent]
    ),
};
for (const [name, operations] of [
  ['model', model],
  ['SQL', sql],
] as const) {
  let context: Awaited<ReturnType<typeof isolationDatabase>> | undefined;
  registerTenantIsolationSuite(name, {
    setup: async () => {
      context = await isolationDatabase();
      return context.db;
    },
    cleanup: async () => {
      await context?.cleanup();
    },
    operations,
  });
}

describe('transaction and policy guarantees', () => {
  let context: Awaited<ReturnType<typeof isolationDatabase>>;
  const a = randomUUID(),
    b = randomUUID();
  const aId = randomUUID(),
    bId = randomUUID();
  beforeAll(async () => {
    context = await isolationDatabase();
    await withTenantTransaction(context.db, a, tx =>
      sql.insert(tx, a, aId, 'a')
    );
    await withTenantTransaction(context.db, b, tx =>
      sql.insert(tx, b, bId, 'b')
    );
  }, 30000);
  afterAll(async () => {
    await context?.cleanup();
  }, 30000);

  it('sets context before work and uses repositories bound to the actual transaction', async () => {
    expect(
      await withTenantTransaction(context.db, a, async tx => {
        expect(
          await tx.one("SELECT current_setting('nap.tenant_id') AS tenant")
        ).toEqual({ tenant: a });
        expect(tx.probe).not.toBe(context.db.db.probe);
        expect((await tx.probe.findAll()).map(row => row.id)).toEqual([aId]);
        expect(await context.db.db.probe.findAll()).toEqual([]);
        return 'detached';
      })
    ).toBe('detached');
  });
  it('commits successful writes and rolls back callback failure and identity escape', async () => {
    const committed = randomUUID();
    await withTenantTransaction(context.db, a, tx =>
      sql.insert(tx, a, committed, committed)
    );
    expect(
      await context.owner.oneOrNone(
        'SELECT id FROM app.isolation_probe WHERE id = $1',
        [committed]
      )
    ).toEqual({ id: committed });
    for (const escape of [false, true]) {
      const id = randomUUID();
      await expect(
        withTenantTransaction(context.db, a, async tx => {
          await sql.insert(tx, a, id, id);
          if (escape) return tx;
          throw new Error('callback failure');
        })
      ).rejects.toThrow(escape ? 'must not escape' : 'callback failure');
      expect(
        await context.owner.oneOrNone(
          'SELECT id FROM app.isolation_probe WHERE id = $1',
          [id]
        )
      ).toBeNull();
    }
    await withTenantTransaction(context.db, a, tx =>
      model.remove(tx, committed)
    );
  });
  it('enforces immutable tenant keys in SQL, including owner writes', async () => {
    await expect(
      withTenantTransaction(context.db, a, tx =>
        tx.none('UPDATE app.isolation_probe SET tenant_id = $1 WHERE id = $2', [
          b,
          aId,
        ])
      )
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      context.owner.none(
        'UPDATE app.isolation_probe SET tenant_id = $1 WHERE id = $2',
        [b, aId]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('preserves the tenant boundary through reporting and aggregates', async () => {
    for (const [tenant, id] of [
      [a, aId],
      [b, bId],
    ] as const) {
      await withTenantTransaction(context.db, tenant, async tx => {
        expect(
          await tx.any('SELECT id FROM reporting.isolation_probe')
        ).toEqual([{ id }]);
        expect(
          await tx.one(
            'SELECT count(*)::int AS count FROM reporting.isolation_probe'
          )
        ).toEqual({ count: 1 });
      });
    }
    expect(
      await context.db.any('SELECT * FROM reporting.isolation_probe')
    ).toEqual([]);
  });
  it('isolates concurrently active tenant transactions', async () => {
    let release: () => void = () => {};
    const ready = new Promise<void>(resolve => {
      release = resolve;
    });
    let entered = 0;
    await Promise.all(
      [a, b].map(tenant =>
        withTenantTransaction(context.db, tenant, async tx => {
          if (++entered === 2) release();
          await ready;
          expect((await tx.probe.findAll()).map(row => row.tenant_id)).toEqual([
            tenant,
          ]);
        })
      )
    );
  });
  it('retains safe privileges and matching non-forced RLS policies after repeat migration', async () => {
    await migrateDatabase('cell', context.fixture.cellUrl, isolationModules);
    await assertRuntimeRole(context.db);
    expect(
      await context.owner.one(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = 'app.isolation_probe'::regclass`
      )
    ).toEqual({ relrowsecurity: true, relforcerowsecurity: false });
    const policy = await context.owner.one<{
      qual: string;
      with_check: string;
    }>(
      "SELECT qual, with_check FROM pg_policies WHERE schemaname = 'app' AND tablename = 'isolation_probe'"
    );
    expect(policy.qual).toBe(policy.with_check);
    expect(policy.qual).toContain('NULLIF');
    await expect(
      context.db.none(
        'ALTER TABLE app.isolation_probe DISABLE ROW LEVEL SECURITY'
      )
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      context.db.none('TRUNCATE app.isolation_probe')
    ).rejects.toMatchObject({ code: '42501' });
  });
  it('does not install fixtures through production registries', async () => {
    const url = await context.fixture.createDatabase('production_registry');
    await migrateDatabase('cell', url, cellModules);
    expect(
      await context.fixture
        .owner(url)
        .one(
          "SELECT to_regclass('app.isolation_probe') AS probe, to_regclass('reporting.isolation_probe') AS report"
        )
    ).toEqual({ probe: null, report: null });
  });
});

it('clears tenant context on the same pooled backend after commit and rollback', async () => {
  const context = await isolationDatabase(1);
  try {
    for (const fail of [false, true]) {
      let pid = 0;
      const operation = withTenantTransaction(
        context.db,
        randomUUID(),
        async tx => {
          pid = (
            await tx.one<{ pid: number }>('SELECT pg_backend_pid() AS pid')
          ).pid;
          if (fail) throw new Error('rollback');
        }
      );
      if (fail) await expect(operation).rejects.toThrow('rollback');
      else await operation;
      expect(
        await context.db.one(
          "SELECT pg_backend_pid() AS pid, NULLIF(current_setting('nap.tenant_id', true), '') AS tenant"
        )
      ).toEqual({ pid, tenant: null });
      expect(await context.db.db.probe.findAll()).toEqual([]);
    }
  } finally {
    await context.cleanup();
  }
}, 30000);
