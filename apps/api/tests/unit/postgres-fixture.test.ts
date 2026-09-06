/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDb } from 'pg-schemata';
import type { Database } from 'pg-schemata';
import { postgresFixture } from '../fixtures/postgres.js';

vi.mock('pg-schemata', () => ({ createDb: vi.fn() }));

// Use the CI branch with mocked handles so cleanup failures can be injected
// without leaving real databases or connections behind.
beforeEach(() => {
  vi.stubEnv('CI', 'true');
  vi.stubEnv(
    'SETUP_ADMIN_URL_TEST',
    'postgres://owner:fixture@localhost/postgres'
  );
  for (const target of ['ADMIN', 'CELL']) {
    const database = `nap_${target.toLowerCase()}_test`;
    vi.stubEnv(
      `${target}_MIGRATION_URL_TEST`,
      `postgres://owner:fixture@localhost/${database}`
    );
    vi.stubEnv(
      `${target}_DATABASE_URL_TEST`,
      `postgres://app:fixture@localhost/${database}`
    );
    vi.stubEnv(`${target}_RUNTIME_ROLE`, 'app');
  }
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

/**
 * Provide only the methods the fixture uses, without opening a real pool.
 * Cast these partial mocks only at the mocked library boundary; implementing
 * unused Database methods would obscure the cleanup behavior under test.
 */
function mockDatabase() {
  return {
    one: vi.fn().mockResolvedValue({ version: 180000 }),
    none: vi
      .fn<(query: string, values?: unknown[]) => Promise<null>>()
      .mockResolvedValue(null),
    close: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

it('reports pool-close failure, attempts every close, and does not drop databases afterward', async () => {
  const control = mockDatabase();
  const broken = mockDatabase();
  const healthy = mockDatabase();
  vi.mocked(createDb)
    .mockReturnValueOnce(control as unknown as Database)
    .mockReturnValueOnce(broken as unknown as Database)
    .mockReturnValueOnce(healthy as unknown as Database);
  const fixture = await postgresFixture();
  fixture.owner(fixture.adminUrl);
  fixture.owner(fixture.cellUrl);
  control.none.mockClear();
  broken.close.mockRejectedValueOnce(new Error('private-driver-diagnostic'));
  await expect(fixture.cleanup()).rejects.toThrow(
    'Failed to close PostgreSQL fixture handles'
  );
  expect(healthy.close).toHaveBeenCalledOnce();
  expect(control.close).toHaveBeenCalledOnce();
  expect(control.none).not.toHaveBeenCalled();
});

it('waits for handle closure and uses non-forcing drops so connection leaks remain visible', async () => {
  const control = mockDatabase();
  const handle = mockDatabase();
  vi.mocked(createDb)
    .mockReturnValueOnce(control as unknown as Database)
    .mockReturnValueOnce(handle as unknown as Database);
  const fixture = await postgresFixture();
  fixture.owner(fixture.adminUrl);
  control.none.mockClear();
  const { promise: closed, resolve: finishClose } =
    Promise.withResolvers<void>();
  handle.close.mockReturnValueOnce(closed);
  const cleanup = fixture.cleanup();
  expect(handle.close).toHaveBeenCalledOnce();
  expect(control.none).not.toHaveBeenCalled();
  finishClose();
  await cleanup;
  expect(control.none.mock.calls.map(([sql]) => sql)).toEqual([
    'DROP DATABASE IF EXISTS $1:name',
    'DROP DATABASE IF EXISTS $1:name',
    'DROP ROLE IF EXISTS $1:name',
  ]);
});
