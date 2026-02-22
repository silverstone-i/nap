/**
 * @file Unit tests for permission hash utility
 * @module tests/unit/permHash
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect } from 'vitest';
import { calcPermHash } from '../../src/lib/permHash.js';

describe('calcPermHash', () => {
  test('returns a hex string', () => {
    const hash = calcPermHash({ caps: {} });
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('produces deterministic output for same input', () => {
    const canon = { caps: { 'projects::::': 'full', 'ap::::': 'view' } };
    const hash1 = calcPermHash(canon);
    const hash2 = calcPermHash(canon);
    expect(hash1).toBe(hash2);
  });

  test('produces same hash regardless of key order', () => {
    const canon1 = { caps: { 'projects::::': 'full', 'ap::::': 'view' } };
    const canon2 = { caps: { 'ap::::': 'view', 'projects::::': 'full' } };
    expect(calcPermHash(canon1)).toBe(calcPermHash(canon2));
  });

  test('produces different hashes for different inputs', () => {
    const hash1 = calcPermHash({ caps: { 'ap::::': 'full' } });
    const hash2 = calcPermHash({ caps: { 'ap::::': 'view' } });
    expect(hash1).not.toBe(hash2);
  });

  test('handles nested objects deterministically', () => {
    const canon = {
      caps: { 'projects::::': 'full' },
      stateFilters: { 'ar::invoices': ['approved', 'sent'] },
    };
    const hash1 = calcPermHash(canon);
    const hash2 = calcPermHash(canon);
    expect(hash1).toBe(hash2);
  });
});
