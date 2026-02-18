/**
 * @file RBAC Layer 4 tests — field group enforcement via ViewController._applyRbacFilters
 * @module tests/rbac/rbacFieldGroups
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

describe('ViewController._applyRbacFilters — Layer 4 (field groups)', () => {
  it('should not restrict columns when no fieldGroups defined', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(basePerms), conditions, options);
    expect(options.columnWhitelist).toBeUndefined();
  });

  it('should set columnWhitelist from fieldGroups', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount', 'status'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    // 'id' is always included
    expect(options.columnWhitelist).toEqual(expect.arrayContaining(['id', 'amount', 'status']));
    expect(options.columnWhitelist).toHaveLength(3);
  });

  it('should intersect with existing columnWhitelist', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['id', 'amount', 'status'] },
    };
    const conditions = [];
    const options = { columnWhitelist: ['id', 'amount', 'client_name'] };
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    // Intersection: only 'id' and 'amount' survive
    expect(options.columnWhitelist).toEqual(expect.arrayContaining(['id', 'amount']));
    expect(options.columnWhitelist).not.toContain('client_name');
    expect(options.columnWhitelist).not.toContain('status');
  });

  it('should always include id even if not in allowed columns', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(options.columnWhitelist).toContain('id');
  });

  it('should fall back to [id] when intersection is empty', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount'] },
    };
    const conditions = [];
    const options = { columnWhitelist: ['client_name'] };
    ctrl._applyRbacFilters(makeReq(perms), conditions, options);
    expect(options.columnWhitelist).toEqual(['id']);
  });

  it('should bypass field groups for admin', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount'] },
    };
    const conditions = [];
    const options = {};
    ctrl._applyRbacFilters(makeReq(perms, 'admin'), conditions, options);
    expect(options.columnWhitelist).toBeUndefined();
  });
});

describe('ViewController._filterRecordFields — Layer 4 (single record)', () => {
  it('should return record unchanged when no fieldGroups', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const record = { id: '1', amount: 100, client_name: 'Acme' };
    const result = ctrl._filterRecordFields(makeReq(basePerms), record);
    expect(result).toEqual(record);
  });

  it('should strip disallowed fields from record', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount'] },
    };
    const record = { id: '1', amount: 100, client_name: 'Acme', margin: 0.15 };
    const result = ctrl._filterRecordFields(makeReq(perms), record);
    expect(result).toEqual({ id: '1', amount: 100 });
  });

  it('should always include id in filtered record', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['status'] },
    };
    const record = { id: '1', amount: 100, status: 'sent' };
    const result = ctrl._filterRecordFields(makeReq(perms), record);
    expect(result).toEqual({ id: '1', status: 'sent' });
  });

  it('should return null unchanged', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    expect(ctrl._filterRecordFields(makeReq(basePerms), null)).toBeNull();
  });

  it('should bypass for super_user', () => {
    const ctrl = new ViewController('test');
    ctrl.rbacConfig = { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' };
    const perms = {
      ...basePerms,
      fieldGroups: { 'ar::ar-invoices': ['amount'] },
    };
    const record = { id: '1', amount: 100, client_name: 'Acme' };
    const result = ctrl._filterRecordFields(makeReq(perms, 'super_user'), record);
    expect(result).toEqual(record);
  });
});
