/**
 * @file Unit tests for RbacQueryContext — builds query modifiers from RBAC canon
 * @module tests/unit/rbacQueryContext
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { buildQueryContext } from '../../src/utils/RbacQueryContext.js';

describe('buildQueryContext', () => {
  const basePerms = {
    caps: {},
    scope: 'all_projects',
    projectIds: null,
    companyIds: null,
    stateFilters: {},
    fieldGroups: {},
  };

  it('should return permissive defaults when perms are empty', () => {
    const ctx = buildQueryContext(basePerms, 'ar', 'ar-invoices');
    expect(ctx).toEqual({
      scope: 'all_projects',
      projectIds: null,
      companyIds: null,
      visibleStatuses: null,
      allowedColumns: null,
    });
  });

  it('should return permissive defaults when perms is null', () => {
    const ctx = buildQueryContext(null, 'ar', 'ar-invoices');
    expect(ctx).toEqual({
      scope: 'all_projects',
      projectIds: null,
      companyIds: null,
      visibleStatuses: null,
      allowedColumns: null,
    });
  });

  it('should extract scope and projectIds for assigned_projects', () => {
    const perms = {
      ...basePerms,
      scope: 'assigned_projects',
      projectIds: ['p1', 'p2'],
    };
    const ctx = buildQueryContext(perms, 'ar', 'ar-invoices');
    expect(ctx.scope).toBe('assigned_projects');
    expect(ctx.projectIds).toEqual(['p1', 'p2']);
    expect(ctx.companyIds).toBeNull();
  });

  it('should extract scope, companyIds and projectIds for assigned_companies', () => {
    const perms = {
      ...basePerms,
      scope: 'assigned_companies',
      companyIds: ['c1', 'c2'],
      projectIds: ['p1', 'p2', 'p3'],
    };
    const ctx = buildQueryContext(perms, 'ar', 'ar-invoices');
    expect(ctx.scope).toBe('assigned_companies');
    expect(ctx.companyIds).toEqual(['c1', 'c2']);
    expect(ctx.projectIds).toEqual(['p1', 'p2', 'p3']);
  });

  it('should extract state filters for matching module::router', () => {
    const perms = {
      ...basePerms,
      stateFilters: { 'ar::ar-invoices': ['approved', 'sent'] },
    };
    const ctx = buildQueryContext(perms, 'ar', 'ar-invoices');
    expect(ctx.visibleStatuses).toEqual(['approved', 'sent']);
  });

  it('should return null visibleStatuses for non-matching module::router', () => {
    const perms = {
      ...basePerms,
      stateFilters: { 'ar::ar-invoices': ['approved'] },
    };
    const ctx = buildQueryContext(perms, 'projects', 'projects');
    expect(ctx.visibleStatuses).toBeNull();
  });

  it('should extract field groups for matching module::router', () => {
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['id', 'amount', 'status'] },
    };
    const ctx = buildQueryContext(perms, 'ar', 'ar-invoices');
    expect(ctx.allowedColumns).toEqual(['id', 'amount', 'status']);
  });

  it('should return null allowedColumns for non-matching module::router', () => {
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['id', 'amount'] },
    };
    const ctx = buildQueryContext(perms, 'ap', 'ap-invoices');
    expect(ctx.allowedColumns).toBeNull();
  });

  it('should handle all layers populated at once', () => {
    const perms = {
      caps: { 'ar::::': 'view' },
      scope: 'assigned_projects',
      projectIds: ['p1'],
      companyIds: null,
      stateFilters: { 'ar::ar-invoices': ['sent'] },
      fieldGroups: { 'ar::ar-invoices': ['id', 'amount'] },
    };
    const ctx = buildQueryContext(perms, 'ar', 'ar-invoices');
    expect(ctx).toEqual({
      scope: 'assigned_projects',
      projectIds: ['p1'],
      companyIds: null,
      visibleStatuses: ['sent'],
      allowedColumns: ['id', 'amount'],
    });
  });
});
