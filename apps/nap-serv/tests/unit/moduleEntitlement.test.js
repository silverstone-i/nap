/**
 * @file Unit tests for moduleEntitlement middleware
 * @module tests/unit/moduleEntitlement
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { moduleEntitlement } from '../../src/middleware/moduleEntitlement.js';

describe('moduleEntitlement', () => {
  function makeReq(allowedModules, requestedModule) {
    return {
      ctx: { tenant: { allowed_modules: allowedModules } },
      resource: { module: requestedModule },
    };
  }

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

  it('allows when module is in allowed_modules', () => {
    const req = makeReq(['projects', 'ar'], 'ar');
    const res = makeRes();
    const next = vi.fn();

    moduleEntitlement(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies when module is not in allowed_modules', () => {
    const req = makeReq(['projects'], 'ar');
    const res = makeRes();
    const next = vi.fn();

    moduleEntitlement(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe('Module not available for this tenant');
  });

  it('allows all modules when allowed_modules is empty array', () => {
    const req = makeReq([], 'ar');
    const res = makeRes();
    const next = vi.fn();

    moduleEntitlement(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows all modules when allowed_modules is null', () => {
    const req = makeReq(null, 'ar');
    const res = makeRes();
    const next = vi.fn();

    moduleEntitlement(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows when no resource module is set', () => {
    const req = { ctx: { tenant: { allowed_modules: ['projects'] } }, resource: {} };
    const res = makeRes();
    const next = vi.fn();

    moduleEntitlement(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
