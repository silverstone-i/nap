/**
 * @file Unit tests for RBAC policy resolution logic
 * @module tests/unit/rbacResolution
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { resolveLevel } from '../../src/middleware/rbac.js';

describe('resolveLevel', () => {
  it('should return "none" when caps is empty', () => {
    expect(resolveLevel({}, 'projects', 'tasks', 'create')).toBe('none');
  });

  it('should match exact module::router::action', () => {
    const caps = { 'ar::invoices::approve': 'full' };
    expect(resolveLevel(caps, 'ar', 'invoices', 'approve')).toBe('full');
  });

  it('should fall back to module::router:: when action not found', () => {
    const caps = { 'ar::invoices::': 'view' };
    expect(resolveLevel(caps, 'ar', 'invoices', 'approve')).toBe('view');
  });

  it('should fall back to module:::: when router not found', () => {
    const caps = { 'projects::::': 'full' };
    expect(resolveLevel(caps, 'projects', 'tasks', 'create')).toBe('full');
  });

  it('should prefer more specific match over less specific', () => {
    const caps = {
      'ar::::': 'view',
      'ar::invoices::': 'full',
      'ar::invoices::approve': 'none',
    };
    expect(resolveLevel(caps, 'ar', 'invoices', 'approve')).toBe('none');
  });

  it('should use module-level when router-level is absent', () => {
    const caps = {
      'ar::::': 'view',
      'ar::invoices::approve': 'none',
    };
    // For a different action on invoices, should fall through to module level
    expect(resolveLevel(caps, 'ar', 'invoices', 'create')).toBe('view');
  });

  it('should return "none" when module has no matching policy', () => {
    const caps = { 'projects::::': 'full' };
    expect(resolveLevel(caps, 'ar', 'invoices', 'create')).toBe('none');
  });

  it('should handle empty strings for router and action', () => {
    const caps = { 'projects::::': 'full' };
    expect(resolveLevel(caps, 'projects', '', '')).toBe('full');
  });
});
