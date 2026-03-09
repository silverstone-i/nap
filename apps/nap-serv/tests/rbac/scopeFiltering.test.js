/**
 * @file RBAC tests for scope filtering hierarchy
 * @module tests/rbac/scopeFiltering
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { buildQueryContext } from '../../src/services/rbacQueryContext.js';
import ViewController from '../../src/lib/ViewController.js';

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

// ── _applyRbacFilters — scope-safe enforcement ─────────────────────
// These tests verify that Layer 2 scope filtering is skipped when
// rbacConfig.scopeColumn is not set, while Layers 3–4 still apply.

/** Build a minimal req stub with embedded permissions. */
function fakeReq(perms) {
  return { user: { permissions: perms } };
}

describe('_applyRbacFilters — Layer 2 scope safety', () => {
  it('skips scope filter when scopeColumn absent and scope is assigned_companies', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'core', router: 'vendors' };

    const conditions = [];
    const options = {};
    const req = fakeReq({ scope: 'assigned_companies', companyIds: ['c1'], projectIds: ['p1'] });

    ctrl._applyRbacFilters(req, conditions, options);

    expect(conditions).toEqual([]);
  });

  it('skips scope filter when scopeColumn absent and scope is assigned_projects', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'core', router: 'employees' };

    const conditions = [];
    const options = {};
    const req = fakeReq({ scope: 'assigned_projects', projectIds: ['p1', 'p2'] });

    ctrl._applyRbacFilters(req, conditions, options);

    expect(conditions).toEqual([]);
  });

  it('applies project scope filter when scopeColumn is set', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ap', router: 'ap-invoices', scopeColumn: 'project_id' };

    const conditions = [];
    const options = {};
    const req = fakeReq({ scope: 'assigned_projects', projectIds: ['p1', 'p2'] });

    ctrl._applyRbacFilters(req, conditions, options);

    expect(conditions).toEqual([{ project_id: { $in: ['p1', 'p2'] } }]);
  });

  it('applies company scope filter when scopeColumn is company_id', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'company_id' };

    const conditions = [];
    const options = {};
    const req = fakeReq({ scope: 'assigned_companies', companyIds: ['c1', 'c2'] });

    ctrl._applyRbacFilters(req, conditions, options);

    expect(conditions).toEqual([{ company_id: { $in: ['c1', 'c2'] } }]);
  });
});

describe('_applyRbacFilters — Layers 3–4 still work without scopeColumn', () => {
  it('applies state filter when scopeColumn is absent', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'core', router: 'vendors' };

    const conditions = [];
    const options = {};
    const req = fakeReq({
      scope: 'assigned_companies',
      companyIds: ['c1'],
      stateFilters: { 'core::vendors': ['active', 'pending'] },
    });

    ctrl._applyRbacFilters(req, conditions, options);

    // Layer 2 skipped (no scopeColumn), Layer 3 applied
    expect(conditions).toEqual([{ status: { $in: ['active', 'pending'] } }]);
  });

  it('applies field group column restriction when scopeColumn is absent', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'core', router: 'vendors' };

    const conditions = [];
    const options = {};
    const req = fakeReq({
      scope: 'all_projects',
      fieldGroups: { 'core::vendors': ['name', 'code'] },
    });

    ctrl._applyRbacFilters(req, conditions, options);

    // Layer 4: columnWhitelist set to allowed columns + id
    expect(options.columnWhitelist).toEqual(expect.arrayContaining(['name', 'code', 'id']));
    expect(options.columnWhitelist).toHaveLength(3);
  });

  it('narrows existing columnWhitelist to allowed columns', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'core', router: 'vendors' };

    const conditions = [];
    const options = { columnWhitelist: ['name', 'code', 'tax_id', 'notes'] };
    const req = fakeReq({
      scope: 'all_projects',
      fieldGroups: { 'core::vendors': ['name', 'code'] },
    });

    ctrl._applyRbacFilters(req, conditions, options);

    // Only columns in BOTH the client whitelist and allowed set survive
    expect(options.columnWhitelist).toEqual(['name', 'code']);
  });
});
