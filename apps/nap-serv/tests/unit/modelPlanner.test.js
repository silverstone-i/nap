/**
 * @file Unit tests for modelPlanner utilities
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { isTableModel, getModelKey, getTableDependencies, orderModels } from '../../src/db/migrations/modelPlanner.js';

function fakeModel(dbSchema, table, foreignKeys = []) {
  return {
    createTable: async () => {},
    schema: {
      dbSchema,
      table,
      constraints: { foreignKeys },
    },
  };
}

describe('isTableModel', () => {
  it('returns truthy for a valid table model', () => {
    expect(isTableModel(fakeModel('admin', 'tenants'))).toBeTruthy();
  });

  it('returns falsy for null/undefined', () => {
    expect(isTableModel(null)).toBeFalsy();
    expect(isTableModel(undefined)).toBeFalsy();
  });

  it('returns falsy if createTable is missing', () => {
    expect(isTableModel({ schema: { dbSchema: 'admin', table: 'x' } })).toBeFalsy();
  });

  it('returns falsy if schema is incomplete', () => {
    expect(isTableModel({ createTable: async () => {}, schema: {} })).toBeFalsy();
    expect(isTableModel({ createTable: async () => {}, schema: { dbSchema: 'admin' } })).toBeFalsy();
  });
});

describe('getModelKey', () => {
  it('returns schema.table in lowercase', () => {
    expect(getModelKey(fakeModel('Admin', 'Tenants'))).toBe('admin.tenants');
  });
});

describe('getTableDependencies', () => {
  it('returns empty array for model with no FKs', () => {
    expect(getTableDependencies(fakeModel('admin', 'tenants'))).toEqual([]);
  });

  it('returns FK target tables', () => {
    const model = fakeModel('admin', 'nap_users', [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' } },
    ]);
    expect(getTableDependencies(model)).toEqual(['admin.tenants']);
  });

  it('handles explicit schema in references', () => {
    const model = fakeModel('public', 'role_members', [
      { columns: ['role_id'], references: { table: 'roles', columns: ['id'], schema: 'public' } },
      { columns: ['user_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' } },
    ]);
    const deps = getTableDependencies(model);
    expect(deps).toContain('public.roles');
    expect(deps).toContain('admin.nap_users');
  });

  it('deduplicates references to the same table', () => {
    const model = fakeModel('public', 'policies', [
      { columns: ['role_id'], references: { table: 'roles', columns: ['id'], schema: 'public' } },
      { columns: ['backup_role_id'], references: { table: 'roles', columns: ['id'], schema: 'public' } },
    ]);
    expect(getTableDependencies(model)).toEqual(['public.roles']);
  });
});

describe('orderModels', () => {
  it('orders independent models (no circular deps)', () => {
    const tenants = fakeModel('admin', 'tenants');
    const users = fakeModel('admin', 'nap_users', [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' } },
    ]);
    const addresses = fakeModel('admin', 'nap_user_addresses', [
      { columns: ['user_id'], references: { table: 'nap_users', columns: ['id'], schema: 'admin' } },
    ]);

    const models = {
      'admin.nap_user_addresses': addresses,
      'admin.nap_users': users,
      'admin.tenants': tenants,
    };

    const ordered = orderModels(models);
    const keys = ordered.map((m) => getModelKey(m));

    expect(keys.indexOf('admin.tenants')).toBeLessThan(keys.indexOf('admin.nap_users'));
    expect(keys.indexOf('admin.nap_users')).toBeLessThan(keys.indexOf('admin.nap_user_addresses'));
  });

  it('returns empty array for no models', () => {
    expect(orderModels({})).toEqual([]);
  });

  it('handles models with no dependencies', () => {
    const a = fakeModel('public', 'table_a');
    const b = fakeModel('public', 'table_b');
    const ordered = orderModels({ 'public.table_a': a, 'public.table_b': b });

    expect(ordered).toHaveLength(2);
  });

  it('throws on circular dependency', () => {
    const a = fakeModel('x', 'a', [{ columns: ['b_id'], references: { table: 'b', columns: ['id'], schema: 'x' } }]);
    const b = fakeModel('x', 'b', [{ columns: ['a_id'], references: { table: 'a', columns: ['id'], schema: 'x' } }]);

    expect(() => orderModels({ 'x.a': a, 'x.b': b })).toThrow(/Cyclic dependency/);
  });

  it('ignores self-references', () => {
    const model = fakeModel('public', 'categories', [
      { columns: ['parent_id'], references: { table: 'categories', columns: ['id'], schema: 'public' } },
    ]);
    expect(() => orderModels({ 'public.categories': model })).not.toThrow();
  });

  it('ignores FK deps on tables outside the provided set', () => {
    const users = fakeModel('admin', 'nap_users', [
      { columns: ['tenant_id'], references: { table: 'tenants', columns: ['id'], schema: 'admin' } },
    ]);
    // tenants is not in the models map — should not throw
    const ordered = orderModels({ 'admin.nap_users': users });
    expect(ordered).toHaveLength(1);
  });
});
