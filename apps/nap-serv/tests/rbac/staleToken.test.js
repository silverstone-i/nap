/**
 * @file RBAC tests for stale token detection
 * @module tests/rbac/staleToken
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calcPermHash } from '../../src/lib/permHash.js';

describe('Stale Token Detection', () => {
  it('calcPermHash produces consistent hash for same canon', () => {
    const canon = {
      caps: { 'ar::::': 'full', 'projects::::': 'view' },
      scope: 'all_projects',
      projectIds: null,
      companyIds: null,
      entityType: 'employee',
      entityId: 'e1',
      stateFilters: {},
      fieldGroups: {},
    };

    const hash1 = calcPermHash(canon);
    const hash2 = calcPermHash(canon);
    expect(hash1).toBe(hash2);
    expect(typeof hash1).toBe('string');
    expect(hash1.length).toBeGreaterThan(0);
  });

  it('calcPermHash is key-order independent', () => {
    const canon1 = { caps: { 'a::::': 'full', 'b::::': 'view' }, scope: 'all_projects' };
    const canon2 = { scope: 'all_projects', caps: { 'b::::': 'view', 'a::::': 'full' } };

    expect(calcPermHash(canon1)).toBe(calcPermHash(canon2));
  });

  it('different permissions produce different hashes', () => {
    const canon1 = { caps: { 'ar::::': 'full' }, scope: 'all_projects' };
    const canon2 = { caps: { 'ar::::': 'view' }, scope: 'all_projects' };

    expect(calcPermHash(canon1)).not.toBe(calcPermHash(canon2));
  });

  it('X-Token-Stale header scenario — permissions changed after token issued', () => {
    const oldPerms = { caps: { 'ar::::': 'view' }, scope: 'assigned_projects' };
    const newPerms = { caps: { 'ar::::': 'full' }, scope: 'all_projects' };

    const oldHash = calcPermHash(oldPerms);
    const newHash = calcPermHash(newPerms);

    // Token was signed with oldHash as ph claim
    // Middleware computes newHash from current permissions
    // Since they differ, X-Token-Stale: 1 should be set
    expect(oldHash).not.toBe(newHash);
  });
});
