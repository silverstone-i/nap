/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { postgresFixture } from '../fixtures/postgres.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { createReadiness } from '../../src/services/readiness.js';
import * as roleChecks from '../../src/db/assertRuntimeRole.js';

let fixture: Awaited<ReturnType<typeof postgresFixture>>;
beforeAll(async () => {
  fixture = await postgresFixture();
}, 30000);
afterAll(async () => {
  await fixture?.cleanup();
}, 30000);
afterEach(() => vi.restoreAllMocks());

/** Independent real runtime pools for each probe scenario. */
function handles() {
  return [
    createAdminDatabase(fixture.runtimeUrl(fixture.adminUrl)),
    createCellDatabase(fixture.runtimeUrl(fixture.cellUrl)),
  ];
}
it('checks privileges freshly, coalesces callers, and recovers after role repair', async () => {
  const databases = handles();
  const readiness = createReadiness(databases);
  const check = vi.spyOn(roleChecks, 'assertRuntimeRole');
  try {
    const first = readiness.check();
    expect(readiness.check()).toBe(first);
    expect(await first).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
    await fixture.control.none('ALTER ROLE $1:name BYPASSRLS', [fixture.role]);
    expect(await readiness.check()).toBe(false);
    await fixture.control.none('ALTER ROLE $1:name NOBYPASSRLS', [
      fixture.role,
    ]);
    expect(await readiness.check()).toBe(true);
    readiness.stop();
    expect(await readiness.check()).toBe(false);
  } finally {
    await fixture.control.none('ALTER ROLE $1:name NOBYPASSRLS', [
      fixture.role,
    ]);
    await Promise.all(databases.map(db => db.close()));
  }
});
it('fails safely on connection loss and recovers on a subsequent cycle', async () => {
  const databases = handles();
  const readiness = createReadiness(databases);
  const connect = vi
    .spyOn(databases[0].db, 'connect')
    .mockRejectedValueOnce(new Error('private connection failure'));
  try {
    expect(await readiness.check()).toBe(false);
    expect(await readiness.check()).toBe(true);
  } finally {
    connect.mockRestore();
    await Promise.all(databases.map(db => db.close()));
  }
});
it('kills acquired connections when a query stalls beyond the cycle budget', async () => {
  const databases = handles();
  const readiness = createReadiness(databases, 100);
  vi.spyOn(roleChecks, 'assertRuntimeRole').mockImplementation(
    async database => {
      await database.transaction(async tx => {
        await tx.one('SELECT pg_sleep(30)');
      });
    }
  );
  try {
    const started = Date.now();
    expect(await readiness.check()).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    await expect
      .poll(
        async () =>
          (
            await fixture.control.one<{ count: number }>(
              "SELECT count(*)::int AS count FROM pg_stat_activity WHERE usename = $1 AND query LIKE '%pg_sleep(30)%'",
              [fixture.role]
            )
          ).count
      )
      .toBe(0);
  } finally {
    readiness.stop();
    await Promise.all(databases.map(db => db.close()));
  }
});
it('retains an expired cycle while waiting for pool acquisition and releases late clients', async () => {
  const databases = handles();
  const original = databases[0].db.connect.bind(databases[0].db);
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const connect = vi
    .spyOn(databases[0].db, 'connect')
    .mockImplementation(async () => {
      await gate;
      return original();
    });
  const readiness = createReadiness(databases, 20);
  try {
    const first = readiness.check();
    expect(await first).toBe(false);
    for (let i = 0; i < 10; i++) expect(readiness.check()).toBe(first);
    expect(connect).toHaveBeenCalledTimes(1);
    release();
    await delay(50);
    connect.mockRestore();
    expect(await createReadiness(databases).check()).toBe(true);
  } finally {
    release();
    readiness.stop();
    await Promise.all(databases.map(db => db.close()));
  }
});
it('cancels a running readiness cycle during shutdown', async () => {
  const databases = handles();
  vi.spyOn(roleChecks, 'assertRuntimeRole').mockImplementation(
    async database => {
      await database.transaction(async tx => {
        await tx.one('SELECT pg_sleep(30)');
      });
    }
  );
  const readiness = createReadiness(databases);
  try {
    const checked = readiness.check();
    readiness.stop();
    expect(await checked).toBe(false);
    expect(await readiness.check()).toBe(false);
  } finally {
    await Promise.all(databases.map(db => db.close()));
  }
});
