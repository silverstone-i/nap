/**
 * @file RBAC Layer 3 tests — record state filter enforcement via ViewController._applyRbacFilters
 * @module tests/rbac/rbacStateFilters
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import ViewController from '../../src/lib/ViewController.js';

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

describe('ViewController._applyRbacFilters — Layer 3 (state filters)', () => {
  it('should not add status filter when no stateFilters defined', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(basePerms), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should add status filter when stateFilters match the resource', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      stateFilters: { 'ar::ar-invoices': ['approved', 'sent'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([{ status: { $in: ['approved', 'sent'] } }]);
  });

  it('should not add filter for non-matching resource', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ap', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      stateFilters: { 'ar::ar-invoices': ['approved'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should bypass state filter for super_user', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      stateFilters: { 'ar::ar-invoices': ['approved'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms, 'super_user'), conditions, options);
    expect(conditions).toEqual([]);
  });

  it('should combine scope and state filter conditions', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      scope: 'assigned_projects',
      projectIds: ['p1'],
      stateFilters: { 'ar::ar-invoices': ['sent'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(conditions).toEqual([
      { project_id: { $in: ['p1'] } },
      { status: { $in: ['sent'] } },
    ]);
  });
});
