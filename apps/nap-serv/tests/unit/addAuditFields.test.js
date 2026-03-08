/**
 * @file Unit tests for addAuditFields middleware
 * @module tests/unit/addAuditFields
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { addAuditFields } from '../../src/middleware/addAuditFields.js';

describe('addAuditFields', () => {
  function makeRes() {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(data) {
        res.body = data;
        return res;
      },
    };
    return res;
  }

  it('injects created_by on POST', () => {
    const req = {
      method: 'POST',
      user: { id: 'uuid-123', tenant_code: 'nap' },
      body: { name: 'test' },
      originalUrl: '/api/core/v1/roles',
    };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(req.body.created_by).toBe('uuid-123');
    expect(req.body.tenant_code).toBe('nap');
    expect(next).toHaveBeenCalledOnce();
  });

  it('injects updated_by on PUT', () => {
    const req = {
      method: 'PUT',
      user: { id: 'uuid-456', tenant_code: 'nap' },
      body: { name: 'updated' },
      originalUrl: '/api/core/v1/roles/update',
    };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(req.body.updated_by).toBe('uuid-456');
    expect(req.body.created_by).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it('injects updated_by on DELETE', () => {
    const req = {
      method: 'DELETE',
      user: { id: 'uuid-789', tenant_code: 'nap' },
      body: {},
      originalUrl: '/api/core/v1/roles/archive',
    };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(req.body.updated_by).toBe('uuid-789');
    expect(next).toHaveBeenCalledOnce();
  });

  it('handles array bodies for bulk operations', () => {
    const req = {
      method: 'POST',
      user: { id: 'uuid-bulk', tenant_code: 'acme' },
      body: [{ name: 'a' }, { name: 'b' }],
      originalUrl: '/api/core/v1/roles/bulk-insert',
    };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(req.body[0].created_by).toBe('uuid-bulk');
    expect(req.body[1].created_by).toBe('uuid-bulk');
    expect(req.body[0].tenant_code).toBe('acme');
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 400 when no user context', () => {
    const req = { method: 'POST', user: null, body: {}, originalUrl: '/test' };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });

  it('uses body tenant_code for tenant creation path', () => {
    const req = {
      method: 'POST',
      user: { id: 'uuid-123', tenant_code: 'nap' },
      body: { tenant_code: 'acme', company: 'Acme Inc' },
      originalUrl: '/api/tenants/v1/tenants',
    };
    const res = makeRes();
    const next = vi.fn();

    addAuditFields(req, res, next);

    expect(req.body.tenant_code).toBe('acme');
    expect(req.body.created_by).toBe('uuid-123');
  });
});
