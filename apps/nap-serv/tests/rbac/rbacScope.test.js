/**
 * @file RBAC Layer 2 tests — data scope enforcement via ViewController._applyRbacFilters
 * @module tests/rbac/rbacScope
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import ViewController from '../../src/lib/ViewController.js';

// Minimal mock for testing _applyRbacFilters directly
function makeReq(perms, role = 'member') {
  return {
    user: { id: 'u1', role },
    ctx: { perms, schema: 'acme' },
  };
}

const basePerms = {
  caps: {},
  scope: 'all_projects',
  projectIds: null,
  companyIds: null,
  stateFilters: {},
  fieldGroups: {},
};

describe('ViewController._applyRbacFilters — Layer 2 (scope)', () => {
  it('should be a no-op when rbacConfig is null', () => {
    const ctrl = new ViewController('test');
    // rbacConfig not set
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(basePerms), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should be a no-op for all_projects scope', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'id' };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(basePerms), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should add project filter for assigned_projects scope', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'id' };
    const perms = { ...basePerms, scope: 'assigned_projects', projectIds: ['p1', 'p2'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ id: { $in: ['p1', 'p2'] } }]);
  });

  it('should use scopeColumn for non-project resources', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = { ...basePerms, scope: 'assigned_projects', projectIds: ['p1'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ project_id: { $in: ['p1'] } }]);
  });

  it('should bypass scope for super_user', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'id' };
    const perms = { ...basePerms, scope: 'assigned_projects', projectIds: ['p1'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms, 'super_user'), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should bypass scope for admin', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'id' };
    const perms = { ...basePerms, scope: 'assigned_projects', projectIds: ['p1'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms, 'admin'), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should not add filter when projectIds is null even with assigned_projects scope', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'id' };
    const perms = { ...basePerms, scope: 'assigned_projects', projectIds: null };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([]);
  });

  // ── assigned_companies scope ──────────────────────────────────────────

  it('should filter by company_id when scope is assigned_companies and scopeColumn is company_id', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'company_id' };
    const perms = { ...basePerms, scope: 'assigned_companies', companyIds: ['c1', 'c2'], projectIds: ['p1', 'p2'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ company_id: { $in: ['c1', 'c2'] } }]);
  });

  it('should filter by projectIds when scope is assigned_companies and scopeColumn is project_id', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = { ...basePerms, scope: 'assigned_companies', companyIds: ['c1'], projectIds: ['p1', 'p2'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ project_id: { $in: ['p1', 'p2'] } }]);
  });

  it('should use default scopeColumn (project_id) for assigned_companies when not specified', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices' };
    const perms = { ...basePerms, scope: 'assigned_companies', companyIds: ['c1'], projectIds: ['p3'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ project_id: { $in: ['p3'] } }]);
  });

  it('should bypass assigned_companies scope for super_user', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'company_id' };
    const perms = { ...basePerms, scope: 'assigned_companies', companyIds: ['c1'] };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms, 'super_user'), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should not add filter when companyIds is null with assigned_companies and company_id scopeColumn', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'projects', router: 'projects', scopeColumn: 'company_id' };
    const perms = { ...basePerms, scope: 'assigned_companies', companyIds: null, projectIds: null };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([]);
  });
});
