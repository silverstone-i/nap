/**
 * @file Unit tests for addAuditFields middleware
 * @module tests/unit/addAuditFields
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { addAuditFields } from '../../src/middleware/addAuditFields.js';

function createMockReqRes({ method = 'POST', user = null, body = {}, url = '/test' } = {}) {
  const req = {
    method,
    user,
    body,
    originalUrl: url,
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

describe('addAuditFields', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000';
  const tenantCode = 'NAP';

  it('should return 400 when user context is missing', () => {
    const { req, res, next } = createMockReqRes({ user: null });
    addAuditFields(req, res, next);
    expect(res.statusCode).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('should inject created_by on POST', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      user: { id: userId, tenant_code: tenantCode },
      body: { name: 'test' },
    });
    addAuditFields(req, res, next);
    expect(req.body.created_by).toBe(userId);
    expect(req.body.tenant_code).toBe(tenantCode);
    expect(next).toHaveBeenCalled();
  });

  it('should inject updated_by on PUT (updated_at managed by pg-schemata)', () => {
    const { req, res, next } = createMockReqRes({
      method: 'PUT',
      user: { id: userId, tenant_code: tenantCode },
      body: { name: 'updated' },
    });
    addAuditFields(req, res, next);
    expect(req.body.updated_by).toBe(userId);
    expect(req.body.updated_at).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('should inject updated_by on PATCH', () => {
    const { req, res, next } = createMockReqRes({
      method: 'PATCH',
      user: { id: userId, tenant_code: tenantCode },
      body: {},
    });
    addAuditFields(req, res, next);
    expect(req.body.updated_by).toBe(userId);
    expect(next).toHaveBeenCalled();
  });

  it('should inject updated_by on DELETE', () => {
    const { req, res, next } = createMockReqRes({
      method: 'DELETE',
      user: { id: userId, tenant_code: tenantCode },
      body: {},
    });
    addAuditFields(req, res, next);
    expect(req.body.updated_by).toBe(userId);
    expect(next).toHaveBeenCalled();
  });

  it('should handle array body on POST', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      user: { id: userId, tenant_code: tenantCode },
      body: [{ name: 'a' }, { name: 'b' }],
    });
    addAuditFields(req, res, next);
    expect(req.body[0].created_by).toBe(userId);
    expect(req.body[1].created_by).toBe(userId);
    expect(next).toHaveBeenCalled();
  });

  it('should use body tenant_code for tenant creation endpoints', () => {
    const { req, res, next } = createMockReqRes({
      method: 'POST',
      user: { id: userId, tenant_code: 'NAP' },
      body: { tenant_code: 'ACME' },
      url: '/api/tenants/v1/tenants/',
    });
    addAuditFields(req, res, next);
    expect(req.body.tenant_code).toBe('ACME');
    expect(next).toHaveBeenCalled();
  });
});
