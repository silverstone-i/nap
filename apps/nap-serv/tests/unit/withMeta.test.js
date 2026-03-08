/**
 * @file Unit tests for withMeta middleware
 * @module tests/unit/withMeta
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { withMeta } from '../../src/middleware/withMeta.js';

describe('withMeta', () => {
  it('annotates req.resource with module, router, action', () => {
    const req = {};
    const res = {};
    const next = vi.fn();

    withMeta({ module: 'ar', router: 'invoices', action: 'approve' })(req, res, next);

    expect(req.resource).toEqual({ module: 'ar', router: 'invoices', action: 'approve' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('defaults router and action to empty string', () => {
    const req = {};
    const res = {};
    const next = vi.fn();

    withMeta({ module: 'projects' })(req, res, next);

    expect(req.resource).toEqual({ module: 'projects', router: '', action: '' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('overwrites any previous req.resource', () => {
    const req = { resource: { module: 'old' } };
    const res = {};
    const next = vi.fn();

    withMeta({ module: 'new', router: 'r' })(req, res, next);

    expect(req.resource.module).toBe('new');
    expect(req.resource.router).toBe('r');
  });
});
