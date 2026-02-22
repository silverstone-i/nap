/**
 * @file Unit tests for central error handler middleware
 * @module nap-serv/tests/unit/errorHandler
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';

function createMockRes() {
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

describe('errorHandler', () => {
  it('should return 400 for SchemaDefinitionError', () => {
    const err = new Error('Validation failed');
    err.name = 'SchemaDefinitionError';
    err.details = [{ field: 'name', message: 'required' }];

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toEqual([{ field: 'name', message: 'required' }]);
  });

  it('should return 400 for validation type errors', () => {
    const err = new Error('Invalid input');
    err.type = 'validation';

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should return 409 for unique constraint violations (23505)', () => {
    const err = new Error('duplicate key value');
    err.name = 'DatabaseError';
    err.code = '23505';
    err.constraint = 'vendors_tenant_id_code_key';

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toBe('Duplicate record');
    expect(res.body.constraint).toBe('vendors_tenant_id_code_key');
  });

  it('should return 422 for foreign key violations (23503)', () => {
    const err = new Error('violates foreign key constraint');
    err.name = 'DatabaseError';
    err.code = '23503';
    err.constraint = 'vendors_source_id_fkey';

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(422);
    expect(res.body.error).toBe('Referenced record not found');
  });

  it('should use explicit status code from error', () => {
    const err = new Error('Forbidden');
    err.status = 403;

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Forbidden');
  });

  it('should return 500 for unhandled errors', () => {
    const err = new Error('Something unexpected');

    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  it('should include message in non-production for unhandled errors', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    const err = new Error('Detailed failure info');
    const res = createMockRes();
    errorHandler(err, {}, res, () => {});

    expect(res.body.message).toBe('Detailed failure info');

    process.env.NODE_ENV = originalEnv;
  });
});
