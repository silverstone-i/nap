/**
 * @file RBAC tests — Layers 2-4 never expand beyond Layer 1
 * @module tests/rbac/denyOverride
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi } from 'vitest';
import { rbac, resolveLevel } from '../../src/middleware/rbac.js';
import { buildQueryContext } from '../../src/services/rbacQueryContext.js';

describe('Deny Override — Layers 2-4 cannot expand Layer 1', () => {
  it('Layer 1 deny (none) blocks regardless of scope/state/fields', () => {
    // User has no capabilities for 'accounting' module
    const caps = { 'projects::::': 'full' };
    expect(resolveLevel(caps, 'accounting', 'journal', 'post')).toBe('none');
  });

  it('Layer 3 state filters do not grant access — they only narrow', () => {
    // Even if state_filters allow a status, Layer 1 must grant at least view first
    const perms = {
      caps: {},
      scope: 'all_projects',
      stateFilters: { 'accounting::journal': ['posted'] },
    };
    const qctx = buildQueryContext(perms, 'accounting', 'journal');

    // State filter is present but Layer 1 caps are empty → rbac middleware denies
    expect(qctx.visibleStatuses).toEqual(['posted']);
    expect(resolveLevel(perms.caps, 'accounting', 'journal', '')).toBe('none');
  });

  it('Layer 4 field groups do not grant access — they only narrow', () => {
    const perms = {
      caps: {},
      scope: 'all_projects',
      fieldGroups: { 'accounting::journal': ['id', 'description'] },
    };
    const qctx = buildQueryContext(perms, 'accounting', 'journal');

    expect(qctx.allowedColumns).toEqual(['id', 'description']);
    // But Layer 1 still denies
    expect(resolveLevel(perms.caps, 'accounting', 'journal', '')).toBe('none');
  });

  it('full access via rbac middleware requires Layer 1 capability', async () => {
    const req = {
      method: 'GET',
      user: {
        id: 'u1',
        permissions: {
          caps: {}, // No caps → no Layer 1 access
          scope: 'all_projects',
        },
      },
      resource: { module: 'ar', router: 'invoices', action: '' },
    };

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
    const next = vi.fn();

    await rbac()(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});
