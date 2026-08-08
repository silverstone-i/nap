/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  getDummyHash,
  hashPassword,
  needsRehash,
  OWASP_BASELINE,
  resolveArgon2Params,
  verifyPassword,
} from '../../src/util/passwordHash.js';

describe('resolveArgon2Params', () => {
  it('defaults to the OWASP baseline', () => {
    expect(resolveArgon2Params({})).toEqual(OWASP_BASELINE);
    expect(resolveArgon2Params({ ARGON2_MEMORY_KIB: '' })).toEqual(
      OWASP_BASELINE
    );
  });

  it('accepts values above the baseline', () => {
    expect(
      resolveArgon2Params({ ARGON2_MEMORY_KIB: '65536', ARGON2_TIME_COST: '3' })
    ).toEqual({ memoryKib: 65536, timeCost: 3, parallelism: 1 });
  });

  it('throws below the baseline (raise-only, ADR-0015)', () => {
    expect(() => resolveArgon2Params({ ARGON2_MEMORY_KIB: '1024' })).toThrow(
      /ARGON2_MEMORY_KIB/
    );
    expect(() => resolveArgon2Params({ ARGON2_TIME_COST: '1' })).toThrow(
      /ARGON2_TIME_COST/
    );
  });

  it('throws on non-integer values', () => {
    expect(() => resolveArgon2Params({ ARGON2_TIME_COST: 'two' })).toThrow(
      /positive integer/
    );
    expect(() => resolveArgon2Params({ ARGON2_PARALLELISM: '1.5' })).toThrow(
      /positive integer/
    );
  });
});

describe('hashPassword / verifyPassword', () => {
  it('produces an argon2id digest that verifies', async () => {
    const digest = await hashPassword('correct horse', OWASP_BASELINE);

    expect(digest).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(digest, 'correct horse')).toBe(true);
    expect(await verifyPassword(digest, 'wrong horse')).toBe(false);
  });

  it('fails closed on a malformed digest', async () => {
    expect(await verifyPassword('not-an-argon2-digest', 'pw')).toBe(false);
    expect(await verifyPassword('$argon2id$corrupted', 'pw')).toBe(false);
  });
});

describe('needsRehash', () => {
  it('is false when the digest matches the parameters', async () => {
    const digest = await hashPassword('pw', OWASP_BASELINE);
    expect(needsRehash(digest, OWASP_BASELINE)).toBe(false);
  });

  it('is true when configuration has been raised', async () => {
    const digest = await hashPassword('pw', OWASP_BASELINE);
    expect(needsRehash(digest, { ...OWASP_BASELINE, timeCost: 3 })).toBe(true);
  });

  it('is false for an unparsable digest', () => {
    expect(needsRehash('not-an-argon2-digest', OWASP_BASELINE)).toBe(false);
  });
});

describe('getDummyHash', () => {
  it('returns a stable baseline digest that verifies nothing', async () => {
    const digest = await getDummyHash();

    expect(digest).toMatch(/^\$argon2id\$/);
    expect(await getDummyHash()).toBe(digest);
    expect(await verifyPassword(digest, 'anything')).toBe(false);
  });
});
