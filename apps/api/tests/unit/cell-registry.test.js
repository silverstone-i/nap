/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it, vi } from 'vitest';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';

const cellId = '11111111-1111-4111-8111-111111111111';

it('loads valid configured cell connections by registered UUID', () => {
  const config = runtimeConfiguration({
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    CELL_DATABASES_TEST: JSON.stringify({
      [cellId]: 'db.example/nap_test_cell',
    }),
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  });
  expect(config.cells[cellId]).toContain('nap-app:');
});

it('rejects malformed cell configuration', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };
  for (const cells of [
    '{',
    '[]',
    JSON.stringify({ invalid: 'db.example/nap_test_cell' }),
    JSON.stringify({ [cellId]: '' }),
  ])
    expect(() =>
      runtimeConfiguration({ ...base, CELL_DATABASES_TEST: cells })
    ).toThrow('INVALID_CONFIGURATION');
});

it('quarantines an unavailable cell and closes every handle', async () => {
  const ready = {
    connect: vi.fn(),
    close: vi.fn(),
    db: { one: vi.fn(async () => ({ ready: 1, roles: 'app.roles' })) },
  };
  const unavailable = {
    connect: vi.fn(async () => {
      throw new Error('offline');
    }),
    close: vi.fn(),
    db: { one: vi.fn() },
  };
  const registry = createCellRegistry(
    { [cellId]: 'ready', ['22222222-2222-4222-8222-222222222222']: 'bad' },
    connection => (connection === 'ready' ? ready : unavailable)
  );
  await registry.connect();
  expect(registry.get(cellId)).toBe(ready);
  expect(() => registry.get('22222222-2222-4222-8222-222222222222')).toThrow(
    'SERVICE_UNAVAILABLE'
  );
  await registry.close();
  expect(ready.close).toHaveBeenCalledOnce();
  expect(unavailable.close).toHaveBeenCalledOnce();
});

it('does not connect an unregistered or disabled configured cell', async () => {
  const handle = {
    connect: vi.fn(),
    close: vi.fn(),
    db: { one: vi.fn() },
  };
  const admin = {
    db: { cells: { findOneBy: vi.fn(async () => null) } },
  };
  const registry = createCellRegistry(
    { [cellId]: 'configured' },
    () => handle,
    admin
  );
  await registry.connect();
  expect(handle.connect).not.toHaveBeenCalled();
  expect(() => registry.get(cellId)).toThrow('SERVICE_UNAVAILABLE');
});
