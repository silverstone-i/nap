/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  argon2id,
  hash,
  needsRehash as argon2NeedsRehash,
  verify,
} from 'argon2';

/** argon2id cost parameters (ADR-0015). */
export interface Argon2Params {
  memoryKib: number;
  timeCost: number;
  parallelism: number;
}

/**
 * The OWASP baseline (ADR-0015): 19 MiB memory, 2 iterations, parallelism 1.
 * Configuration may raise these values, never lower them.
 */
export const OWASP_BASELINE: Argon2Params = {
  memoryKib: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * argon2id parameters from env (`ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`,
 * `ARGON2_PARALLELISM`), defaulting to the baseline. Raise-only: a value
 * below the baseline throws instead of silently weakening hashes (ADR-0015).
 *
 * @throws {Error} When a variable is not a positive integer or is below the
 *   OWASP baseline.
 */
export function resolveArgon2Params(env: NodeJS.ProcessEnv): Argon2Params {
  const read = (name: string, fallback: number, floor: number): number => {
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer, got "${raw}"`);
    }
    if (value < floor) {
      throw new Error(
        `${name} must be at least ${floor} (OWASP baseline, ADR-0015), got "${raw}"`
      );
    }
    return value;
  };

  return {
    memoryKib: read(
      'ARGON2_MEMORY_KIB',
      OWASP_BASELINE.memoryKib,
      OWASP_BASELINE.memoryKib
    ),
    timeCost: read(
      'ARGON2_TIME_COST',
      OWASP_BASELINE.timeCost,
      OWASP_BASELINE.timeCost
    ),
    parallelism: read(
      'ARGON2_PARALLELISM',
      OWASP_BASELINE.parallelism,
      OWASP_BASELINE.parallelism
    ),
  };
}

/**
 * The single hashing path for `password_hash` (ADR-0015): login rehash,
 * password change, and the bootstrap script all call this.
 */
export function hashPassword(
  password: string,
  params: Argon2Params
): Promise<string> {
  return hash(password, {
    type: argon2id,
    memoryCost: params.memoryKib,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  });
}

/**
 * Verifies a password against a stored digest; false on any mismatch. A
 * malformed digest fails closed as a mismatch — a corrupted `password_hash`
 * refuses the login rather than crashing it.
 */
export async function verifyPassword(
  digest: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(digest, password);
  } catch {
    return false;
  }
}

/**
 * True when the digest's recorded parameters lag `params`, meaning the hash
 * should be recomputed on this login (ADR-0015: opportunistic rehash). An
 * unparsable digest is false — there is nothing meaningful to rehash from.
 */
export function needsRehash(digest: string, params: Argon2Params): boolean {
  try {
    return argon2NeedsRehash(digest, {
      memoryCost: params.memoryKib,
      timeCost: params.timeCost,
      parallelism: params.parallelism,
    });
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * A baseline-cost digest of a random string, computed once per process.
 * Login verifies unknown-email and NULL-hash attempts against it so all
 * refusal paths cost one argon2id verification — no timing oracle for user
 * enumeration (PRD 0004).
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hash(crypto.randomUUID(), {
    type: argon2id,
    memoryCost: OWASP_BASELINE.memoryKib,
    timeCost: OWASP_BASELINE.timeCost,
    parallelism: OWASP_BASELINE.parallelism,
  });
  return dummyHash;
}
