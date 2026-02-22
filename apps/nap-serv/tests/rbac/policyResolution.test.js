/**
 * @file RBAC tests for 4-level policy resolution hierarchy
 * @module tests/rbac/policyResolution
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { resolveLevel } from '../../src/middleware/rbac.js';

describe('Policy Resolution — 4-level fallback', () => {
  const caps = {
    'ar::invoices::approve': 'full',
    'ar::invoices::': 'view',
    'ar::::': 'view',
    'projects::::': 'full',
  };

  it('level 1: exact module::router::action match', () => {
    expect(resolveLevel(caps, 'ar', 'invoices', 'approve')).toBe('full');
  });

  it('level 2: falls back to module::router::', () => {
    expect(resolveLevel(caps, 'ar', 'invoices', 'create')).toBe('view');
  });

  it('level 3: falls back to module::::', () => {
    expect(resolveLevel(caps, 'ar', 'payments', 'create')).toBe('view');
  });

  it('level 4: returns none when no match at any level', () => {
    expect(resolveLevel(caps, 'accounting', 'ledger', 'post')).toBe('none');
  });

  it('prefers most specific key over broader', () => {
    // ar::invoices::approve = full, ar::invoices:: = view
    // Should pick the action-level match (full), not router-level (view)
    expect(resolveLevel(caps, 'ar', 'invoices', 'approve')).toBe('full');
  });

  it('wildcard module-level grants apply to all routers', () => {
    expect(resolveLevel(caps, 'projects', 'units', 'create')).toBe('full');
    expect(resolveLevel(caps, 'projects', 'tasks', 'update')).toBe('full');
  });

  it('returns none for completely unregistered module', () => {
    expect(resolveLevel(caps, 'unknown', 'anything', 'do')).toBe('none');
  });

  it('handles empty caps object', () => {
    expect(resolveLevel({}, 'ar', 'invoices', 'approve')).toBe('none');
  });
});
