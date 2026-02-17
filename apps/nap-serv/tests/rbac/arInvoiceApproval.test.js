/**
 * @file RBAC tests — ar::invoices::approve permission enforcement
 * @module tests/rbac/arInvoiceApproval
 *
 * Verifies that the PUT /approve endpoint on AR invoices enforces the
 * ar::invoices::approve policy at 'full' level.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rbac, withMeta } from '../../src/middleware/rbac.js';

vi.mock('../../src/utils/RbacPolicies.js', () => ({
  loadPoliciesForUserTenant: vi.fn().mockResolvedValue({}),
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
    loadPoliciesForUserTenant.mockResolvedValue({});
  });

  it('withMeta sets ar::invoices::approve resource metadata', () => {
    const middleware = withMeta({ module: 'ar', router: 'invoices', action: 'approve' });
    const { req, res, next } = createMockReqRes();
    middleware(req, res, next);
    expect(req.resource).toEqual({ module: 'ar', router: 'invoices', action: 'approve' });
    expect(next).toHaveBeenCalled();
  });

  it('super_user bypasses ar::invoices::approve check', async () => {
    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'super_user', schema_name: 'nap' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('admin bypasses ar::invoices::approve check', async () => {
    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'admin', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies member without ar::invoices::approve policy', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({});

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.module).toBe('ar');
    expect(res.body.router).toBe('invoices');
    expect(res.body.action).toBe('approve');
    expect(res.body.needed).toBe('full');
    expect(res.body.have).toBe('none');
  });

  it('allows member with ar::invoices::approve = full', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      'ar::invoices::approve': 'full',
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('denies member with ar::invoices::approve = view (need full)', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      'ar::invoices::approve': 'view',
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('denies when module-level is full but action-level overrides to none', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      'ar::::': 'full',
      'ar::invoices::approve': 'none',
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('falls back to module-level policy when action not defined', async () => {
    loadPoliciesForUserTenant.mockResolvedValue({
      'ar::::': 'full',
    });

    const middleware = rbac('full');
    const { req, res, next } = createMockReqRes({
      user: { id: 'u1', role: 'member', schema_name: 'acme' },
      resource: { module: 'ar', router: 'invoices', action: 'approve' },
      ctx: { schema: 'acme' },
    });
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
