/**
 * @file RBAC tests for system role definitions
 * @module tests/rbac/systemRoles
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock logger
vi.mock('../../src/lib/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { seedSystemRoles } = await import('../../src/system/core/services/systemRoleSeeder.js');

describe('System Role Seeding', () => {
  let mockDb;
  let mockPgp;
  let insertedRoles;
  let insertedPolicies;

  beforeEach(() => {
    insertedRoles = [];
    insertedPolicies = [];

    mockDb = {
      oneOrNone: vi.fn().mockResolvedValue(null), // Nothing exists yet
      one: vi.fn().mockImplementation(async (_sql, params) => {
        const role = { id: `role-${params[1]}` };
        insertedRoles.push({ ...role, code: params[1], scope: params[6] });
        return role;
      }),
      none: vi.fn().mockImplementation(async (_sql, params) => {
        insertedPolicies.push({ role_id: params[1], module: params[2], level: params[5] });
      }),
    };

    mockPgp = {
      as: {
        name: vi.fn((s) => `"${s}"`),
      },
    };
  });

  it('seeds admin role for all tenants', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'acme', 'ACME', false);

    const admin = insertedRoles.find((r) => r.code === 'admin');
    expect(admin).toBeDefined();
    expect(admin.scope).toBe('all_projects');
  });

  it('does NOT seed super_user or support for non-NapSoft tenants', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'acme', 'ACME', false);

    expect(insertedRoles.find((r) => r.code === 'super_user')).toBeUndefined();
    expect(insertedRoles.find((r) => r.code === 'support')).toBeUndefined();
  });

  it('seeds super_user, admin, and support for NapSoft tenant', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'nap', 'NAP', true);

    expect(insertedRoles.find((r) => r.code === 'super_user')).toBeDefined();
    expect(insertedRoles.find((r) => r.code === 'admin')).toBeDefined();
    expect(insertedRoles.find((r) => r.code === 'support')).toBeDefined();
  });

  it('super_user gets full access policy for all modules', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'nap', 'NAP', true);

    const superPolicies = insertedPolicies.filter((p) => p.role_id === 'role-super_user');
    expect(superPolicies.some((p) => p.module === '' && p.level === 'full')).toBe(true);
  });

  it('support gets none for financial modules', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'nap', 'NAP', true);

    const supportPolicies = insertedPolicies.filter((p) => p.role_id === 'role-support');
    const financialDenied = supportPolicies.filter(
      (p) => ['accounting', 'ap', 'ar'].includes(p.module) && p.level === 'none',
    );
    expect(financialDenied.length).toBe(3);
  });

  it('is idempotent — skips existing roles', async () => {
    // Simulate role already existing
    mockDb.oneOrNone.mockResolvedValue({ id: 'existing-role-id' });

    await seedSystemRoles(mockDb, mockPgp, 'acme', 'ACME', false);

    // Should not insert any roles (only check policies)
    expect(mockDb.one).not.toHaveBeenCalled();
  });

  it('all system roles use scope all_projects', async () => {
    await seedSystemRoles(mockDb, mockPgp, 'nap', 'NAP', true);

    for (const role of insertedRoles) {
      expect(role.scope).toBe('all_projects');
    }
  });
});
