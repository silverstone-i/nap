/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { it, expect, vi, afterEach } from 'vitest';
const fake = vi.hoisted(() => ({ using: vi.fn(), create: vi.fn() }));
vi.mock('../../src/infrastructure/runtime/adminDatabase.js', () => ({
  using: fake.using,
  createAdminDatabase: fake.create,
}));
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { cli } from '../../src/application/maintenance/admin.js';
const config = {
  database: 'nap_fixture',
  endpoint: 'localhost/nap_fixture',
  maintenance: 'localhost/postgres',
  adminPassword: 'private-admin',
  appPassword: 'private-app',
};
afterEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});
it('reports a created database after a later setup failure and reuses it on retry', async () => {
  let exists = false;
  const sql = [];
  const db = {
    task: async fn => fn(db),
    any: async () => [
      {
        rolname: 'nap-admin',
        rolcanlogin: true,
        rolcreatedb: true,
        rolcreaterole: true,
      },
      { rolname: 'nap-app', rolcanlogin: true },
    ],
    one: async () => ({}),
    oneOrNone: async () => (exists ? { owner: 'nap-admin' } : null),
    none: async query => {
      sql.push(query);
      if (query.startsWith('CREATE DATABASE')) exists = true;
    },
  };
  fake.using.mockImplementation(async (connection, fn) => {
    if (connection.includes('/nap_fixture'))
      throw new Error('raw failure with private-admin');
    return fn(db);
  });
  await expect(setupLocal(config)).rejects.toMatchObject({
    code: 'SETUP_FAILED',
    created: 'nap_fixture',
  });
  await expect(setupLocal(config)).rejects.toMatchObject({
    code: 'SETUP_FAILED',
    created: undefined,
  });
  expect(sql.filter(q => q.startsWith('CREATE DATABASE'))).toHaveLength(1);
});
it('closes the database handle when connection fails', async () => {
  const handle = {
    connect: vi.fn().mockRejectedValue(new Error('unavailable')),
    close: vi.fn(),
  };
  fake.create.mockReturnValue(handle);
  await expect(migrateAdmin(config)).rejects.toThrow('unavailable');
  expect(handle.close).toHaveBeenCalledOnce();
});
it('rejects invalid registry before creating a handle', async () => {
  await expect(
    migrateAdmin(config, [{ name: 'bad', databaseTarget: 'cell' }])
  ).rejects.toThrow('INVALID_REGISTRY');
  expect(fake.create).not.toHaveBeenCalled();
});
it('prints safe CLI failure without echoing credential arguments', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await cli('setup', ['--password', 'top-secret']);
    expect(log.mock.calls.flat().join()).not.toContain('top-secret');
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      status: 'failed',
      code: 'INVALID_ARGUMENTS',
    });
    expect(process.exitCode).toBe(1);
  } finally {
    log.mockRestore();
  }
});
