/**
 * @file Unit tests for migration modelPlanner utilities
 * @module tests/unit/modelPlanner
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect } from 'vitest';
import { isTableModel, getModelKey, getTableDependencies, orderModels } from '../../src/db/migrations/modelPlanner.js';

function makeModel(dbSchema, table, foreignKeys = []) {
  return {
    schema: {
      dbSchema,
      table,
      constraints: { foreignKeys },
    },
    createTable: async () => {},
    setSchemaName: () => {},
    schemaName: dbSchema,
    tableName: table,
    db: { none: async () => {} },
  };
}

describe('isTableModel', () => {
  test('returns truthy for valid table model', () => {
    // isTableModel returns the table name (truthy), not strict boolean true
    expect(isTableModel(makeModel('admin', 'tenants'))).toBeTruthy();
  });

  test('returns false for null', () => {
    expect(isTableModel(null)).toBe(false);
  });

  test('returns false for model without createTable', () => {
    expect(isTableModel({ schema: { dbSchema: 'admin', table: 'x' } })).toBe(false);
  });
});

describe('getModelKey', () => {
  test('returns schema.table lowercase', () => {
    expect(getModelKey(makeModel('admin', 'Tenants'))).toBe('admin.tenants');
  });
});

describe('getTableDependencies', () => {
  test('returns empty array when no FKs', () => {
    expect(getTableDependencies(makeModel('admin', 'tenants'))).toEqual([]);
  });

  test('extracts FK targets', () => {
    const model = makeModel('admin', 'nap_users', [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' } },
    ]);
    expect(getTableDependencies(model)).toEqual(['admin.tenants']);
  });
});

describe('orderModels', () => {
  test('orders models by dependency', () => {
    const tenants = makeModel('admin', 'tenants');
    const users = makeModel('admin', 'nap_users', [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' } },
    ]);

    const ordered = orderModels({
      'admin.nap_users': users,
      'admin.tenants': tenants,
    });

    expect(ordered[0]).toBe(tenants);
    expect(ordered[1]).toBe(users);
  });

  test('throws on cyclic dependency', () => {
    const a = makeModel('admin', 'a', [
      { columns: ['b_id'], references: { table: 'b', columns: ['id'], schema: 'admin' } },
    ]);
    const b = makeModel('admin', 'b', [
      { columns: ['a_id'], references: { table: 'a', columns: ['id'], schema: 'admin' } },
    ]);

    expect(() => orderModels({ 'admin.a': a, 'admin.b': b })).toThrow(/Cyclic/);
  });
});
