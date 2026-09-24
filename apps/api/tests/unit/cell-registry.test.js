/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cellModules,
  cellSchemas,
  validateCellRegistry,
} from '../../src/modules/cell.js';
import {
  adminModules,
  validateAdminRegistry,
} from '../../src/modules/admin.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
describe('cell registry', () => {
  it('constructs all five cell models without opening a connection', async () => {
    const db = createCellDatabase('postgresql://invalid/unused');
    try {
      expect(
        Object.keys(db.db).filter(k => cellModules[0].models[k])
      ).toHaveLength(5);
      validateCellRegistry();
    } finally {
      await db.close();
    }
  });
  it('migrates cell schemas in the documented order', () =>
    expect(cellSchemas).toEqual(['cell', 'reference', 'app', 'reporting']));
  it.each([
    m => ({ ...m, databaseTarget: 'admin' }),
    m => ({ ...m, schema: 'admin' }),
    m => ({ ...m, schema: 'public' }),
    m => ({ ...m, name: '' }),
    m => ({ ...m, migrations: null }),
    m => ({ ...m, entitlementType: 'other' }),
    m => ({ ...m, migrations: [...m.migrations, ...m.migrations] }),
    m => ({
      ...m,
      migrations: [{ ...m.migrations[0], checksum: 'not-a-checksum' }],
    }),
    m => ({ ...m, models: null }),
    m => ({
      ...m,
      models: {
        bad: class {
          static schema = { dbSchema: 'cell', table: 'bad' };
        },
      },
    }),
    m => ({
      ...m,
      models: { tenants: adminModules[0].models.tenants },
    }),
    m => ({
      ...m,
      models: { outbox: m.models.tenants },
    }),
  ])('rejects invalid descriptors before connecting', change =>
    expect(() => validateCellRegistry([change(cellModules[0])])).toThrow(
      'INVALID_REGISTRY'
    )
  );
  it('rejects duplicate module names and an empty registry', () => {
    expect(() =>
      validateCellRegistry([...cellModules, ...cellModules])
    ).toThrow('INVALID_REGISTRY');
    expect(() => validateCellRegistry([])).toThrow('INVALID_REGISTRY');
  });
  it('keeps the admin and cell registries apart', () => {
    expect(() => validateAdminRegistry(cellModules)).toThrow(
      'INVALID_REGISTRY'
    );
    expect(() => validateCellRegistry(adminModules)).toThrow(
      'INVALID_REGISTRY'
    );
  });
  it('never runs cell migrations from runtime startup', async () => {
    const dir = fileURLToPath(
      new URL('../../src/application/runtime/', import.meta.url)
    );
    for (const file of await readdir(dir))
      expect(await readFile(join(dir, file), 'utf8')).not.toMatch(
        /migrateCell|migrate\(/
      );
  });
});
