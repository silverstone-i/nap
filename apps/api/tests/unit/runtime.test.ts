/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { adminRepositories } from '../../src/db/admin/repositories.js';
import { createCellRegistry } from '../../src/services/cellRegistry.js';
import { createRuntime } from '../../src/runtime.js';
import { createReadiness } from '../../src/services/readiness.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { cellRepositories } from '../../src/db/cell/repositories.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { logger } from '../../src/util/logger.js';

vi.mock('../../src/services/readiness.js', () => ({
  createReadiness: vi.fn(),
}));
beforeEach(() => {
  vi.stubEnv('SESSION_SECRET_TEST', 'a'.repeat(64));
  vi.stubEnv('AUTH_THROTTLE_SECRET_TEST', 'b'.repeat(64));
  vi.mocked(createReadiness).mockReturnValue({
    check: () => Promise.resolve(true),
    stop: vi.fn(),
  });
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

/** Does: Creates admin and cell handles for URLs that are never connected. */
function handles() {
  const result = {
    admin: createAdminDatabase('postgres://unused:unused@localhost/unused', {
      repositories: adminRepositories,
    }),
    cell2: createCellDatabase('postgres://unused:unused@localhost/unused2', {
      repositories: cellRepositories,
    }),
    cell: createCellDatabase('postgres://unused:unused@localhost/unused', {
      repositories: cellRepositories,
    }),
  };
  const cells = createCellRegistry(
    new Map([
      ['00000000-0000-4000-8000-000000000001', result.cell],
      ['00000000-0000-4000-8000-000000000002', result.cell2],
    ])
  );
  vi.spyOn(result.admin.db.cells, 'findById').mockResolvedValue({
    id: '00000000-0000-4000-8000-000000000001',
  } as Awaited<ReturnType<typeof result.admin.db.cells.findById>>);
  return { ...result, cells };
}
/** Read the OS-selected address of a test listener. */
function url(runtime: ReturnType<typeof createRuntime>) {
  const address = runtime.server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test listener');
  return `http://127.0.0.1:${address.port}`;
}
it('stops before opening a listener when shutdown interrupts startup', async () => {
  let finish: (value: boolean) => void = () => {};
  vi.mocked(createReadiness).mockReturnValue({
    check: () =>
      new Promise(resolve => {
        finish = resolve;
      }),
    stop: vi.fn(),
  });
  const runtime = createRuntime(handles());
  const started = runtime.start(0);
  expect(await runtime.shutdown()).toBe(0);
  finish(true);
  await started;
  expect(runtime.server.listening).toBe(false);
});
it('refuses a failed startup check and cleans partial initialization', async () => {
  vi.mocked(createReadiness).mockReturnValue({
    check: () => Promise.resolve(false),
    stop: vi.fn(),
  });
  const pools = handles();
  const db = pools.admin;
  const runtime = createRuntime(pools);
  await expect(runtime.start(0)).rejects.toThrow('readiness failed');
  expect(await runtime.shutdown(1)).toBe(1);
  expect(db.isClosed).toBe(true);
});
it('reports a listener bind failure and closes its handles', async () => {
  const occupied = createServer();
  occupied.listen(0);
  await once(occupied, 'listening');
  const address = occupied.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing address');
  const pools = handles();
  const db = pools.admin;
  const runtime = createRuntime(pools);
  try {
    await expect(runtime.start(address.port)).rejects.toThrow(
      'failed to listen'
    );
    expect(await runtime.shutdown(1)).toBe(1);
    expect(db.isClosed).toBe(true);
  } finally {
    await new Promise<void>(resolve => occupied.close(() => resolve()));
  }
});
it('drains an active HTTP request before closing pools and shares repeated shutdown', async () => {
  const pools = handles();
  const close = vi.spyOn(pools.admin, 'close');
  const cellCloses = [pools.cell, pools.cell2].map(cell =>
    vi.spyOn(cell, 'close')
  );
  const cache = {
    namespace: 'runtime-test',
    read: vi.fn(() => Promise.reject(new Error('offline'))),
    write: vi.fn(() => Promise.reject(new Error('offline'))),
    close: vi.fn(() => Promise.resolve()),
  };
  const runtime = createRuntime(pools, { drainMs: 1000, cache });
  let complete: () => void = () => {};
  let admitted: () => void = () => {};
  const entered = new Promise<void>(resolve => {
    admitted = resolve;
  });
  const app = runtime.server.listeners('request')[0];
  if (app) runtime.server.removeListener('request', app);
  runtime.server.on('request', (_request, response) => {
    complete = () => response.end('finished');
    admitted();
  });
  await runtime.start(0);
  const response = fetch(url(runtime));
  await entered;
  const stopped = runtime.shutdown();
  expect(runtime.shutdown()).toBe(stopped);
  expect(close).not.toHaveBeenCalled();
  for (const cellClose of cellCloses) expect(cellClose).not.toHaveBeenCalled();
  expect(cache.close).not.toHaveBeenCalled();
  expect(pools.cells.get('00000000-0000-4000-8000-000000000001')).toBe(
    pools.cell
  );
  complete();
  expect(await (await response).text()).toBe('finished');
  expect(await stopped).toBe(0);
  expect(close).toHaveBeenCalledTimes(1);
  for (const cellClose of cellCloses)
    expect(cellClose).toHaveBeenCalledTimes(1);
  expect(cache.close).toHaveBeenCalledTimes(1);
});
it('forces stuck requests closed after the drain deadline and returns failure', async () => {
  const runtime = createRuntime(handles(), { drainMs: 20 });
  const app = runtime.server.listeners('request')[0];
  if (app) runtime.server.removeListener('request', app);
  let entered: () => void = () => {};
  const admitted = new Promise<void>(resolve => {
    entered = resolve;
  });
  runtime.server.on('request', () => entered());
  await runtime.start(0);
  const response = fetch(url(runtime)).catch(() => null);
  await admitted;
  expect(await runtime.shutdown()).toBe(1);
  expect(await response).toBeNull();
});
it.each(['reject', 'hang'] as const)(
  'bounds pool cleanup when a handle will %s',
  async mode => {
    const pools = handles();
    const db = pools.admin;
    const close = vi
      .spyOn(db, 'close')
      .mockImplementation(() =>
        mode === 'reject'
          ? Promise.reject(new Error('private'))
          : new Promise(() => {})
      );
    const runtime = createRuntime(pools, { poolCloseMs: 20 });
    try {
      expect(await runtime.shutdown()).toBe(1);
    } finally {
      close.mockRestore();
      await db.close();
    }
  }
);
it('cannot restart after shutdown and tolerates shutdown before start', async () => {
  const runtime = createRuntime(handles());
  await runtime.shutdown();
  await runtime.start(0);
  await delay(1);
  expect(runtime.server.listening).toBe(false);
});

it('rejects an unknown configured UUID before listening and closes every pool', async () => {
  const pools = handles();
  vi.spyOn(pools.admin.db.cells, 'findById').mockResolvedValue(null);
  const runtime = createRuntime(pools);
  await expect(runtime.start(0)).rejects.toThrow('Unknown configured cell ID');
  expect(runtime.server.listening).toBe(false);
  await runtime.shutdown(1);
  expect(
    [pools.admin, pools.cell, pools.cell2].every(pool => pool.isClosed)
  ).toBe(true);
});
