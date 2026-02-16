/**
 * @file Unit tests for permission hash computation
 * @module tests/unit/permHash
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { calcPermHash } from '../../src/utils/permHash.js';

describe('calcPermHash', () => {
  it('should return a hex string', () => {
    const hash = calcPermHash({ caps: {} });
    expect(typeof hash).toBe('string');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent hashes for the same input', () => {
    const canon = { caps: { 'projects::::': 'full', 'gl::::': 'view' } };
    const h1 = calcPermHash(canon);
    const h2 = calcPermHash(canon);
    expect(h1).toBe(h2);
  });

  it('should produce the same hash regardless of key order', () => {
    const a = { caps: { 'projects::::': 'full', 'gl::::': 'view' } };
    const b = { caps: { 'gl::::': 'view', 'projects::::': 'full' } };
    expect(calcPermHash(a)).toBe(calcPermHash(b));
  });

  it('should produce different hashes for different inputs', () => {
    const a = { caps: { 'projects::::': 'full' } };
    const b = { caps: { 'projects::::': 'view' } };
    expect(calcPermHash(a)).not.toBe(calcPermHash(b));
  });

  it('should handle empty caps object', () => {
    const hash = calcPermHash({ caps: {} });
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64);
  });

  it('should handle nested objects deterministically', () => {
    const a = { caps: { 'ar::invoices::approve': 'none' }, meta: { version: 1 } };
    const b = { meta: { version: 1 }, caps: { 'ar::invoices::approve': 'none' } };
    expect(calcPermHash(a)).toBe(calcPermHash(b));
  });
});
