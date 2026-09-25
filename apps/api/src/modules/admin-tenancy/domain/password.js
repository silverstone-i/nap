/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { z } from 'zod';
import { AdminAuthError } from './errors.js';

/**
 * Floor for every Argon2id parameter, from M0001-03 §7. Configuration may
 * raise a value but never lower it, so a deployment cannot weaken hashing by
 * editing an environment variable.
 */
export const ARGON2_MINIMUM = Object.freeze({
  memoryKib: 19456,
  timeCost: 2,
  parallelism: 1,
});

/** Argon2 version this module writes. Matches the library default, `0x13`. */
const ARGON2_VERSION = 0x13;

/** Bounds on the configured hashing parameters. A weaker value is a configuration error, not a preference. */
const hashingPolicySchema = z.strictObject({
  memoryKib: z.number().int().min(ARGON2_MINIMUM.memoryKib).max(1_048_576),
  timeCost: z.number().int().min(ARGON2_MINIMUM.timeCost).max(16),
  parallelism: z.number().int().min(ARGON2_MINIMUM.parallelism).max(16),
});

/**
 * @typedef {object} HashingPolicy
 * @property {number} memoryKib Argon2id memory cost in kibibytes; at least 19456.
 * @property {number} timeCost Argon2id iterations; at least two.
 * @property {number} parallelism Argon2id lanes; at least one.
 */

/**
 * Validate the configured hashing parameters.
 * @param {unknown} policy
 * @returns {HashingPolicy}
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parseHashingPolicy(policy) {
  const result = hashingPolicySchema.safeParse(policy);
  if (!result.success) throw new AdminAuthError('INVALID_INPUT');
  return result.data;
}

/**
 * Translate a policy into the options the library expects.
 * @param {HashingPolicy} policy
 * @returns {object}
 */
function options(policy) {
  return {
    type: argon2.argon2id,
    memoryCost: policy.memoryKib,
    timeCost: policy.timeCost,
    parallelism: policy.parallelism,
    version: ARGON2_VERSION,
  };
}

/** Inclusive password length bounds, counted in Unicode characters. */
export const PASSWORD_MINIMUM = 8;
export const PASSWORD_MAXIMUM = 128;

/**
 * Validate a plaintext password's length.
 *
 * Counted in code points rather than UTF-16 units, so an emoji or another
 * astral character counts once. Measuring `value.length` instead would let a
 * four-emoji password satisfy an eight-character rule.
 * @param {unknown} value
 * @returns {string} The password, unchanged; never trimmed or normalized.
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parsePassword(value) {
  if (typeof value !== 'string') throw new AdminAuthError('INVALID_INPUT');
  const characters = [...value].length;
  if (characters < PASSWORD_MINIMUM || characters > PASSWORD_MAXIMUM)
    throw new AdminAuthError('INVALID_INPUT');
  return value;
}

/**
 * Validate an operator-supplied temporary password for a new portal user.
 *
 * Any nonempty password is accepted: the account is created with
 * `must_change_password = true`, so the user replaces it with a password that
 * meets `parsePassword` at first login, and a later invite flow will let users
 * choose their own. The maximum still applies because login refuses a longer
 * password, which would leave the account unable to sign in.
 * @param {unknown} value
 * @returns {string} The password, unchanged.
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parseTemporaryPassword(value) {
  if (typeof value !== 'string') throw new AdminAuthError('INVALID_INPUT');
  const characters = [...value].length;
  if (characters < 1 || characters > PASSWORD_MAXIMUM)
    throw new AdminAuthError('INVALID_INPUT');
  return value;
}

/**
 * Hash a password with the configured Argon2id parameters and a unique salt.
 *
 * The library generates the salt, so no two hashes of the same password match
 * and a stolen table cannot be attacked with one precomputed set.
 * @param {HashingPolicy} policy
 * @param {string} plain
 * @returns {Promise<string>} PHC-encoded digest.
 * @throws {AdminAuthError} `INTERNAL_ERROR`
 */
export async function hashPassword(policy, plain) {
  try {
    return await argon2.hash(plain, options(policy));
  } catch {
    throw new AdminAuthError('INTERNAL_ERROR');
  }
}

/**
 * Verify a password against a stored digest.
 *
 * A digest the library cannot parse reports `false` rather than throwing. A
 * corrupt or hand-written row would otherwise answer with an internal error
 * while a wrong password answered with a rejection, which is exactly the
 * difference an attacker probing for weak rows wants to see.
 * @param {string} digest Stored password hash.
 * @param {string} plain Presented password.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(digest, plain) {
  try {
    return await argon2.verify(digest, plain);
  } catch {
    return false;
  }
}

/**
 * PHC encoding of an Argon2 digest: `$argon2id$v=19$m=19456,p=1,t=2$salt$hash`.
 *
 * The parameter list is read by name rather than by position. The library
 * writes `m,p,t`, the RFC's examples write `m,t,p`, and a digest produced by
 * another implementation may use either; matching a fixed order would read
 * every one of them as unparseable and rehash the whole table on each login.
 */
const DIGEST_PATTERN =
  /^\$(argon2[a-z]+)\$v=(\d+)\$([a-z]=\d+(?:,[a-z]=\d+)*)\$/;

/**
 * Whether a stored digest is weaker than the configured parameters.
 *
 * Deliberately not `argon2.needsRehash`, which reports any difference. This
 * reports only an increase, which is what M0001-03 §7 asks for: lowering a
 * parameter must leave existing hashes alone rather than silently rewriting
 * every account at the weaker setting on its next login. A digest that is not
 * Argon2id, is an older version, or cannot be parsed is always replaced.
 * @param {HashingPolicy} policy
 * @param {string} digest
 * @returns {boolean}
 */
export function needsRehash(policy, digest) {
  const parsed = DIGEST_PATTERN.exec(digest ?? '');
  if (!parsed) return true;
  const [, type, version, parameters] = parsed;
  if (type !== 'argon2id' || Number(version) !== ARGON2_VERSION) return true;
  const stored = Object.fromEntries(
    parameters.split(',').map(pair => {
      const [name, value] = pair.split('=');
      return [name, Number(value)];
    })
  );
  return (
    !(stored.m >= policy.memoryKib) ||
    !(stored.t >= policy.timeCost) ||
    !(stored.p >= policy.parallelism)
  );
}

/**
 * Digests used by `dummyVerify`, one per parameter set seen so far.
 *
 * Computed on first use rather than at import, because hashing is the
 * expensive operation this module exists to perform and a process that never
 * sees an unknown account should never pay for it. Keyed on the parameters so
 * that raising them raises the cost of the unknown-account path too; a digest
 * frozen at the old settings would make an unknown account measurably faster
 * to reject than a real one.
 * @type {Map<string, Promise<string>>}
 */
const dummyDigests = new Map();

/**
 * Spend the same work an unsuccessful verification would, for an account that
 * does not exist.
 *
 * M0001-03 §7 requires this: without it, a login naming an unknown address
 * returns as soon as the lookup misses, and the response time alone tells an
 * attacker which addresses hold accounts.
 * @param {HashingPolicy} policy
 * @returns {Promise<false>} Always `false`, so a caller can return it directly.
 */
export async function dummyVerify(policy) {
  const key = `${policy.memoryKib}:${policy.timeCost}:${policy.parallelism}`;
  let digest = dummyDigests.get(key);
  if (!digest) {
    // Evict a rejected promise so a transient hashing failure does not leave
    // this path permanently broken, and permanently faster than a real one.
    digest = hashPassword(policy, randomBytes(32).toString('base64'));
    digest.catch(() => dummyDigests.delete(key));
    dummyDigests.set(key, digest);
  }
  await verifyPassword(await digest, randomBytes(32).toString('base64'));
  return false;
}
