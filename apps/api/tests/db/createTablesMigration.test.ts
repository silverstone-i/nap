/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { MigrationContext } from 'pg-schemata';
import { describe, expect, it, vi } from 'vitest';

import { createTables, moduleRegistry } from '../../src/db/index.js';

function fakeModel(
  table: string,
  foreignKeys: { table: string; schema?: string }[] = []
) {
  return {
    schema: {
      dbSchema: 'tenant',
      table,
      constraints: {
        foreignKeys: foreignKeys.map(references => ({
          type: 'ForeignKey',
          columns: ['x'],
          references: { ...references, columns: ['id'] },
        })),
      },
    },
    createTable: vi.fn().mockResolvedValue(null),
  };
}

function contextWith(models: Record<string, unknown>): MigrationContext {
  return {
    schema: 'tenant',
    module: 'fake',
    db: {} as MigrationContext['db'],
    pgp: {} as MigrationContext['pgp'],
    logger: null,
    models,
    ensureExtensions: () => Promise.resolve(),
  };
}

describe('createTables migration', () => {
  it('is a frozen migration with a stable id and checksum', () => {
    expect(createTables.id).toBe('0001-create-tables');
    expect(Object.isFrozen(createTables)).toBe(true);
    expect(createTables.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is the single migration of every registered descriptor', () => {
    expect(moduleRegistry).not.toHaveLength(0);
    for (const module of moduleRegistry) {
      expect(module.migrations, module.name).toEqual([createTables]);
    }
  });

  it('creates every model in FK-safe order', async () => {
    const child = fakeModel('policies', [{ table: 'roles' }]);
    const parent = fakeModel('roles');
    const calls: string[] = [];
    child.createTable.mockImplementation(() => {
      calls.push('policies');
      return Promise.resolve(null);
    });
    parent.createTable.mockImplementation(() => {
      calls.push('roles');
      return Promise.resolve(null);
    });

    await createTables.up(contextWith({ child, parent }));

    expect(calls).toEqual(['roles', 'policies']);
  });

  it('ignores foreign keys pointing outside the module', async () => {
    const model = fakeModel('addresses', [
      { table: 'countries', schema: 'admin' },
    ]);

    await createTables.up(contextWith({ model }));

    expect(model.createTable).toHaveBeenCalledTimes(1);
  });
});
