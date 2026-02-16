/**
 * @file RBAC middleware tests — policy resolution, deny overrides, super_user bypass
 * @module tests/rbac/rbacMiddleware
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rbac, withMeta } from '../../src/middleware/rbac.js';

// Mock loadPoliciesForUserTenant
vi.mock('../../src/utils/RbacPolicies.js', () => ({
  loadPoliciesForUserTenant: vi.fn().mockResolvedValue({}),
}));

function createMockReqRes({ user = {}, resource = {}, method = 'GET', ctx = {} } = {}) {
  const req = {
    method,
    user,
    resource,
    ctx: { ...ctx, user },
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

describe('withMeta', () => {
  it('should set req.resource with module, router, and action', () => {
    const middleware = withMeta({ module: 'ar', router: 'invoices', action: 'approve' });
    const { req, res, next } = createMockReqRes();
    middleware(req, res, next);
    expect(req.resource).toEqual({ module: 'ar', router: 'invoices', action: 'approve' });
    expect(next).toHaveBeenCalled();
  });

  it('should default router and action to empty strings', () => {
    const middleware = withMeta({ module: 'projects' });
    const { req, res, next } = createMockReqRes();
    middleware(req, res, next);
    expect(req.resource).toEqual({ module: 'projects', router: '', action: '' });
    expect(next).toHaveBeenCalled();
  });
});

describe('rbac middleware', () => {
  let loadPoliciesForUserTenant;

  beforeEach(async () => {
    const mod = await import('../../src/utils/RbacPolicies.js');
    loadPoliciesForUserTenant = mod.loadPoliciesForUserTenant;
    loadPoliciesForUserTenant.mockReset();
    loadPoliciesForUserTenant.mockResolvedValue({});
  });

  describe('super_user bypass', () => {
    it('should bypass all checks for super_user role', async () => {
      const middleware = rbac('full');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'super_user', schema_name: 'nap' },
        resource: { module: 'tenants', router: '', action: '' },
      });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBeNull();
    });
  });

  describe('admin role', () => {
    it('should bypass checks for non-tenants modules', async () => {
      const middleware = rbac('full');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'admin', schema_name: 'nap' },
        resource: { module: 'projects', router: '', action: '' },
      });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should deny admin access to tenants module', async () => {
      const middleware = rbac('full');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'admin', schema_name: 'nap' },
        resource: { module: 'tenants', router: '', action: '' },
      });
      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
      expect(res.body.note).toContain('admin cannot access tenants module');
    });
  });

  describe('policy resolution', () => {
    it('should allow when policy level meets required level', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({ 'projects::::': 'full' });

      const middleware = rbac('view');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'projects', router: '', action: '' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should deny when policy level is below required', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({ 'projects::::': 'view' });

      const middleware = rbac('full');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'projects', router: '', action: '' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });

    it('should deny action-level override even when module is full', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({
        'ar::::': 'view',
        'ar::invoices::approve': 'none',
      });

      const middleware = rbac('view');
      const { req, res, next } = createMockReqRes({
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'ar', router: 'invoices', action: 'approve' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('method-based defaults', () => {
    it('should default to "view" for GET when no hint given', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({ 'projects::::': 'view' });

      const middleware = rbac();
      const { req, res, next } = createMockReqRes({
        method: 'GET',
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'projects', router: '', action: '' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('should default to "full" for POST when no hint given', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({ 'projects::::': 'view' });

      const middleware = rbac();
      const { req, res, next } = createMockReqRes({
        method: 'POST',
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'projects', router: '', action: '' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(403);
    });
  });

  describe('deny payload', () => {
    it('should include detailed deny information', async () => {
      loadPoliciesForUserTenant.mockResolvedValue({});

      const middleware = rbac('full');
      const { req, res, next } = createMockReqRes({
        method: 'POST',
        user: { id: 'u1', role: 'member', schema_name: 'acme' },
        resource: { module: 'projects', router: 'tasks', action: 'create' },
        ctx: { schema: 'acme' },
      });
      await middleware(req, res, next);
      expect(res.statusCode).toBe(403);
      expect(res.body).toMatchObject({
        userId: 'u1',
        module: 'projects',
        router: 'tasks',
        action: 'create',
        method: 'POST',
        needed: 'full',
        have: 'none',
      });
    });
  });
});
