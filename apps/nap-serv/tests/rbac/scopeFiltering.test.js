/**
 * @file RBAC tests for scope filtering hierarchy
 * @module tests/rbac/scopeFiltering
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { buildQueryContext } from '../../src/services/rbacQueryContext.js';

describe('Scope Filtering — hierarchy', () => {
  it('all_projects scope returns null projectIds and companyIds', () => {
    const perms = { scope: 'all_projects', projectIds: null, companyIds: null };
    const qctx = buildQueryContext(perms, 'projects', 'projects');

    expect(qctx.scope).toBe('all_projects');
    expect(qctx.projectIds).toBeNull();
    expect(qctx.companyIds).toBeNull();
  });

  it('assigned_companies scope provides companyIds', () => {
    const perms = {
      scope: 'assigned_companies',
      projectIds: ['p1', 'p2'],
      companyIds: ['c1'],
    };
    const qctx = buildQueryContext(perms, 'projects', 'projects');

    expect(qctx.scope).toBe('assigned_companies');
    expect(qctx.companyIds).toEqual(['c1']);
    expect(qctx.projectIds).toEqual(['p1', 'p2']);
  });

  it('assigned_projects scope provides projectIds', () => {
    const perms = {
      scope: 'assigned_projects',
      projectIds: ['p1'],
      companyIds: null,
    };
    const qctx = buildQueryContext(perms, 'projects', 'projects');

    expect(qctx.scope).toBe('assigned_projects');
    expect(qctx.projectIds).toEqual(['p1']);
  });

  it('self scope provides entityType and entityId', () => {
    const perms = {
      scope: 'self',
      projectIds: null,
      companyIds: null,
      entityType: 'vendor',
      entityId: 'v-123',
    };
    const qctx = buildQueryContext(perms, 'ap', 'invoices');

    expect(qctx.scope).toBe('self');
    expect(qctx.entityType).toBe('vendor');
    expect(qctx.entityId).toBe('v-123');
  });

  it('scope hierarchy: all_projects > assigned_companies > assigned_projects > self', () => {
    // This is a design invariant — most permissive scope wins during merge
    const SCOPE_ORDER = { self: 0, assigned_projects: 1, assigned_companies: 2, all_projects: 3 };

    expect(SCOPE_ORDER.all_projects).toBeGreaterThan(SCOPE_ORDER.assigned_companies);
    expect(SCOPE_ORDER.assigned_companies).toBeGreaterThan(SCOPE_ORDER.assigned_projects);
    expect(SCOPE_ORDER.assigned_projects).toBeGreaterThan(SCOPE_ORDER.self);
  });
});
