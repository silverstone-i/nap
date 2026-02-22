/**
 * @file Unit tests for authRedis middleware
 * @module tests/unit/authRedis
 *
 * Tests the middleware in isolation using mocked JWT and DB.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { authRedis } from '../../src/middleware/authRedis.js';

// Mock db module
vi.mock('../../src/db/db.js', () => {
  const mockFindOneBy = vi.fn();
  const mockFindById = vi.fn();
  const mockDb = vi.fn((modelName) => {
    if (modelName === 'napUsers') return { findOneBy: mockFindOneBy };
    if (modelName === 'tenants') return { findById: mockFindById };
    return {};
  });
  return { default: mockDb, db: mockDb, __mockFindOneBy: mockFindOneBy, __mockFindById: mockFindById };
});

const dbMock = await import('../../src/db/db.js');
const { __mockFindOneBy: mockFindOneBy, __mockFindById: mockFindById } = dbMock;

const SECRET = 'test-access-secret-for-authredis!';
process.env.ACCESS_TOKEN_SECRET = SECRET;

function makeReq(overrides = {}) {
  return {
    path: '/api/something',
    originalUrl: '/api/something',
    cookies: {},
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.setHeader = vi.fn();
  return res;
}

describe('authRedis middleware', () => {
  const middleware = authRedis();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('bypasses auth for /auth/login path', async () => {
    const req = makeReq({ path: '/auth/login', originalUrl: '/api/auth/login' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('bypasses auth for /auth/refresh path', async () => {
    const req = makeReq({ path: '/auth/refresh', originalUrl: '/api/auth/refresh' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('bypasses auth for /auth/logout path', async () => {
    const req = makeReq({ path: '/auth/logout', originalUrl: '/api/auth/logout' });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('returns 401 when no auth_token cookie', async () => {
    const req = makeReq({ cookies: {} });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for invalid JWT', async () => {
    const req = makeReq({ cookies: { auth_token: 'invalid.jwt.token' } });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('populates req.user for valid JWT and existing user + tenant', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const tenantId = '660e8400-e29b-41d4-a716-446655440000';
    const token = jwt.sign({ sub: userId, ph: null }, SECRET, { expiresIn: '15m' });

    mockFindOneBy.mockResolvedValue({
      id: userId,
      email: 'admin@napsoft.com',
      entity_type: null,
      entity_id: null,
      status: 'active',
      tenant_id: tenantId,
      deactivated_at: null,
    });

    mockFindById.mockResolvedValue({
      id: tenantId,
      tenant_code: 'NAP',
      company: 'NapSoft LLC',
      schema_name: 'nap',
      status: 'active',
    });

    const req = makeReq({ cookies: { auth_token: token } });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe(userId);
    expect(req.user.email).toBe('admin@napsoft.com');
    expect(req.user.tenant_code).toBe('nap');
    expect(req.user.schema_name).toBe('nap');
  });

  test('returns 401 when user not found in DB', async () => {
    const token = jwt.sign({ sub: 'nonexistent-id' }, SECRET, { expiresIn: '15m' });

    mockFindOneBy.mockResolvedValue(null);

    const req = makeReq({ cookies: { auth_token: token } });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('respects x-tenant-code header for tenant resolution', async () => {
    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const tenantId = '660e8400-e29b-41d4-a716-446655440000';
    const token = jwt.sign({ sub: userId, ph: null }, SECRET, { expiresIn: '15m' });

    mockFindOneBy.mockResolvedValue({
      id: userId,
      email: 'admin@napsoft.com',
      entity_type: null,
      entity_id: null,
      status: 'active',
      tenant_id: tenantId,
    });

    mockFindById.mockResolvedValue({
      id: tenantId,
      tenant_code: 'NAP',
      schema_name: 'nap',
    });

    const req = makeReq({
      cookies: { auth_token: token },
      headers: { 'x-tenant-code': 'ACME' },
    });
    const res = makeRes();
    const next = vi.fn();

    await middleware(req, res, next);
    expect(req.user.tenant_code).toBe('acme');
  });
});
