/**
 * @file Unit tests for requireNapsoftTenant middleware
 * @module tests/unit/requireNapsoftTenant
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { requireNapsoftTenant } from '../../src/middleware/requireNapsoftTenant.js';

function mockReqRes({ user } = {}) {
  const req = { user };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('requireNapsoftTenant', () => {
  beforeEach(() => {
    process.env.NAPSOFT_TENANT = 'NAP';
  });

  it('should call next() for NapSoft tenant users', () => {
    const { req, res, next } = mockReqRes({ user: { tenant_code: 'NAP' } });
    requireNapsoftTenant(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBeNull();
  });

  it('should be case-insensitive', () => {
    const { req, res, next } = mockReqRes({ user: { tenant_code: 'nap' } });
    requireNapsoftTenant(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('should return 403 for non-NapSoft tenant users', () => {
    const { req, res, next } = mockReqRes({ user: { tenant_code: 'ACME' } });
    requireNapsoftTenant(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain('not a NapSoft user');
  });

  it('should return 403 when user is null', () => {
    const { req, res, next } = mockReqRes({ user: null });
    requireNapsoftTenant(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it('should return 403 when user has no tenant_code', () => {
    const { req, res, next } = mockReqRes({ user: { email: 'test@test.com' } });
    requireNapsoftTenant(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
