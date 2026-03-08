/**
 * @file Unit tests for permissionLoader
 * @module tests/unit/permissionLoader
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db before importing permissionLoader
const mockFindWhere = vi.fn();
const mockFindById = vi.fn();
const mockDb = vi.fn(() => ({
  findWhere: mockFindWhere,
  findById: mockFindById,
}));

vi.mock('../../src/db/db.js', () => ({ default: mockDb }));
vi.mock('../../src/lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { loadPermissions } = await import('../../src/services/permissionLoader.js');

describe('loadPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty canon when schemaName is null', async () => {
    const result = await loadPermissions({ schemaName: null, userId: 'u1' });
    expect(result.caps).toEqual({});
    expect(result.scope).toBe('all_projects');
  });

  it('returns empty canon when userId is null', async () => {
    const result = await loadPermissions({ schemaName: 'test', userId: null });
    expect(result.caps).toEqual({});
  });

  it('returns empty canon when entityType is null (bootstrap user)', async () => {
    const result = await loadPermissions({
      schemaName: 'nap',
      userId: 'u1',
      entityType: null,
      entityId: null,
    });
    expect(result.caps).toEqual({});
    expect(result.entityType).toBeNull();
    expect(result.entityId).toBeNull();
  });

  it('returns empty canon when entity has no roles', async () => {
    // findById returns entity with empty roles
    mockFindById.mockResolvedValueOnce({ id: 'e1', roles: [] });

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'employee',
      entityId: 'e1',
    });
    expect(result.caps).toEqual({});
  });

  it('resolves capabilities from entity roles', async () => {
    // Entity lookup
    mockFindById.mockResolvedValueOnce({ id: 'e1', roles: ['admin'] });
    // Roles lookup
    mockFindWhere
      .mockResolvedValueOnce([{ id: 'r1', code: 'admin', scope: 'all_projects' }])
      // Policies lookup
      .mockResolvedValueOnce([
        { module: 'ar', router: null, action: null, level: 'full' },
        { module: 'projects', router: null, action: null, level: 'view' },
      ])
      // State filters
      .mockResolvedValueOnce([])
      // Field group grants
      .mockResolvedValueOnce([]);

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'employee',
      entityId: 'e1',
    });

    expect(result.caps['ar::::'] || result.caps['ar::null::null']).toBeTruthy();
    expect(result.scope).toBe('all_projects');
  });

  it('merges multi-role policies — most permissive level wins', async () => {
    // Entity has two roles
    mockFindById.mockResolvedValueOnce({ id: 'e1', roles: ['viewer', 'editor'] });
    // Roles lookup
    mockFindWhere
      .mockResolvedValueOnce([
        { id: 'r1', code: 'viewer', scope: 'assigned_projects' },
        { id: 'r2', code: 'editor', scope: 'all_projects' },
      ])
      // Policies: viewer has view, editor has full for same module
      .mockResolvedValueOnce([
        { module: 'ar', router: null, action: null, level: 'view' },
        { module: 'ar', router: null, action: null, level: 'full' },
      ])
      .mockResolvedValueOnce([]) // state filters
      .mockResolvedValueOnce([]); // field group grants

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'employee',
      entityId: 'e1',
    });

    // Most permissive level wins
    const arLevel = result.caps['ar::::'] || result.caps['ar::null::null'];
    expect(arLevel).toBe('full');
    // Most permissive scope wins
    expect(result.scope).toBe('all_projects');
  });

  it('handles 4-level fallback correctly', async () => {
    mockFindById.mockResolvedValueOnce({ id: 'e1', roles: ['custom'] });
    mockFindWhere
      .mockResolvedValueOnce([{ id: 'r1', code: 'custom', scope: 'all_projects' }])
      .mockResolvedValueOnce([
        { module: 'ar', router: 'invoices', action: 'approve', level: 'full' },
        { module: 'ar', router: 'invoices', action: null, level: 'view' },
        { module: 'ar', router: null, action: null, level: 'none' },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'employee',
      entityId: 'e1',
    });

    // Specific action level
    expect(result.caps['ar::invoices::approve']).toBe('full');
    // Router-level fallback
    expect(result.caps['ar::invoices::null'] || result.caps['ar::invoices::']).toBeTruthy();
  });

  it('returns entityType and entityId in canon', async () => {
    mockFindById.mockResolvedValueOnce({ id: 'e1', roles: [] });

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'vendor',
      entityId: 'v-123',
    });

    expect(result.entityType).toBe('vendor');
    expect(result.entityId).toBe('v-123');
  });

  it('gracefully handles entity table not existing', async () => {
    // findById throws (table doesn't exist)
    mockFindById.mockRejectedValueOnce(new Error('relation "employees" does not exist'));

    const result = await loadPermissions({
      schemaName: 'test',
      userId: 'u1',
      entityType: 'employee',
      entityId: 'e1',
    });

    expect(result.caps).toEqual({});
  });
});
