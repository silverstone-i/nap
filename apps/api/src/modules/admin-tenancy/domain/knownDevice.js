/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AdminAuthError } from './errors.js';
import { KNOWN_DEVICE_DAYS } from './throttle.js';

const knownDevicePolicySchema = z.strictObject({ secret: z.string().min(32) });

/**
 * @typedef {object} KnownDevicePolicy
 * @property {string} secret HMAC key for known-device tokens; at least 32 characters.
 */

/**
 * Validate the configured known-device policy.
 * @param {unknown} policy
 * @returns {KnownDevicePolicy}
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parseKnownDevicePolicy(policy) {
  const result = knownDevicePolicySchema.safeParse(policy);
  if (!result.success) throw new AdminAuthError('INVALID_INPUT');
  return result.data;
}

const TOKEN_PATTERN = /^([0-9a-f-]{36})\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

/**
 * Signature over a token's user, expiry, and the user's current password hash.
 *
 * Covering `password_hash` is what makes M0001-13-R009 hold without a column:
 * any write to the hash, whether a change, an operator reset, or a rehash,
 * voids every token signed before it.
 * @param {KnownDevicePolicy} policy
 * @param {string} userId
 * @param {string} expires Expiry in Unix seconds, as written in the token.
 * @param {string} passwordHash
 * @returns {Buffer}
 */
function sign(policy, userId, expires, passwordHash) {
  return createHmac('sha256', policy.secret)
    .update(`${userId}.${expires}.${passwordHash}`)
    .digest();
}

/**
 * Issue a known-device token for one portal user (M0001-13-R006).
 * @param {KnownDevicePolicy} policy
 * @param {{id: string, password_hash: string}} credential
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {{token: string, maxAgeMs: number}}
 */
export function issueKnownDeviceToken(policy, credential, now = Date.now()) {
  const maxAgeMs = KNOWN_DEVICE_DAYS * 24 * 60 * 60 * 1000;
  const expires = String(Math.floor((now + maxAgeMs) / 1000));
  const signature = sign(
    policy,
    credential.id,
    expires,
    credential.password_hash
  ).toString('base64url');
  return { token: `${credential.id}.${expires}.${signature}`, maxAgeMs };
}

/**
 * The portal user a token claims, or `null` when it is not even shaped like
 * one. Says nothing about validity; `verifyKnownDeviceToken` decides that.
 * @param {unknown} token
 * @returns {string|null}
 */
export function knownDeviceUser(token) {
  if (typeof token !== 'string') return null;
  return TOKEN_PATTERN.exec(token)?.[1] ?? null;
}

/**
 * Whether a token proves a known device for the submitted account
 * (M0001-13-R008). Every mismatch answers `false`; nothing here throws.
 * @param {KnownDevicePolicy} policy
 * @param {unknown} token
 * @param {{id: string, email: string, password_hash: string}|null} credential Row for `knownDeviceUser(token)`.
 * @param {string} account Normalized account input of this login.
 * @param {number} [now] Milliseconds since the epoch.
 * @returns {boolean}
 */
export function verifyKnownDeviceToken(
  policy,
  token,
  credential,
  account,
  now = Date.now()
) {
  if (typeof token !== 'string' || !credential) return false;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return false;
  const [, userId, expires, signature] = match;
  if (userId !== credential.id || credential.email !== account) return false;
  if (Number(expires) * 1000 <= now) return false;
  const expected = sign(policy, userId, expires, credential.password_hash);
  const presented = Buffer.from(signature, 'base64url');
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}
