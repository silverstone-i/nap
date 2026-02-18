/**
 * @file RBAC tests — ar::ar-invoices::approve permission enforcement
 * @module tests/rbac/arInvoiceApproval
 *
 * Verifies that the PUT /approve endpoint on AR invoices enforces the
 * ar::ar-invoices::approve policy at 'full' level.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rbac, withMeta } from '../../src/middleware/rbac.js';

const { EMPTY_CANON } = vi.hoisted(() => ({
  EMPTY_CANON: { caps: {}, scope: 'all_projects', projectIds: null, companyIds: null, stateFilters: {}, fieldGroups: {} },
}));

vi.mock('../../src/utils/RbacPolicies.js', () => ({
  loadPoliciesForUserTenant: vi.fn().mockResolvedValue({ ...EMPTY_CANON }),
}));

function createMockReqRes({ user = {}, resource = {}, method = 'PUT', ctx = {} } = {}) {
  const req = {
    method,
    user,
    resource,
    ctx: { ...ctx, user },
    body: {},
    query: {},
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('AR Invoice Approval RBAC', () => {
  let loadPoliciesForUserTenant;

  beforeEach(async () => {
    const mod = await import('../../src/utils/RbacPolicies.js');
    loadPoliciesForUserTenant = mod.loadPoliciesForUserTenant;
    loadPoliciesForUserTenant.mockReset();
    loadPoliciesForUserTenant.mockResolvedValue({ ...EMPTY_CANON });
  });

  it('withMeta sets ar::ar-invoices::approve resource metadata', () => {
    const middleware = withMeta({ module: 'ar', router: 'ar-invoices', action: 'approve' });
    const { req, res, next } = createMockReqRes();
    middleware(req, res, next);
    expect(req.resource).toEqual({ module: 'ar', router: 'ar-invoices', action: 'approve' });
    expect(next).toHaveBeenCalled();
  });

  it('super_user bypasses ar::ar-invoices::approve check', async () => {
    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'super_user', schema_name: 'nap' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('admin bypasses ar::ar-invoices::approve check', async () => {
    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'admin', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies member without ar::ar-invoices::approve policy', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({ ...EMPTY_CANON });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.module).toBe('ar');
    expect(res.body.router).toBe('ar-invoices');
    expect(res.body.action).toBe('approve');
    expect(res.body.needed).toBe('full');
    expect(res.body.have).toBe('none');
  });

  it('allows member with ar::ar-invoices::approve = full', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      ...EMPTY_CANON,
      caps: { 'ar::ar-invoices::approve': 'full' },
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies member with ar::ar-invoices::approve = view (need full)', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      ...EMPTY_CANON,
      caps: { 'ar::ar-invoices::approve': 'view' },
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('denies when module-level is full but action-level overrides to none', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      ...EMPTY_CANON,
      caps: { 'ar::::': 'full', 'ar::ar-invoices::approve': 'none' },
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('falls back to module-level policy when action not defined', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      ...EMPTY_CANON,
      caps: { 'ar::::': 'full' },
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'ar-invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
