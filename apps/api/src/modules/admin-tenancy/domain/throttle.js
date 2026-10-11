/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { AdminAuthError } from './errors.js';

/** Minutes a failure window spans before it restarts. */
export const WINDOW_MINUTES = 15;

/** Minutes a key stays hard-locked once it reaches its failure limit. */
export const LOCK_MINUTES = 15;

/** Longest delay, in seconds, a failure imposes before the hard lock. */
export const DELAY_CAP_SECONDS = 30;

/** Days a known-device token stays valid, from M0001-13-R006. */
export const KNOWN_DEVICE_DAYS = 90;

/** Hours after which a spent throttle row may be deleted, from M0001-03 §7. */
export const RETENTION_HOURS = 24;

/** The three independent throttle dimensions a login evaluates (M0001-13-R001). */
export const THROTTLE_KINDS = Object.freeze({
  pair: 'pair',
  address: 'address',
  account: 'account',
});

/**
 * Per-kind limits from M0001-13-R002 and M0001-13-R003.
 *
 * `delayFrom` is the failure count at which doubling delays start, or `null`
 * for none. The pair key needs no delay: its hard lock at five already caps
 * guessing. The address key waits for ten so one person's typos on a shared
 * office address slow nobody else down.
 */
export const THROTTLE_LIMITS = Object.freeze({
  pair: Object.freeze({ maxFailures: 5, delayFrom: null }),
  address: Object.freeze({ maxFailures: 100, delayFrom: 10 }),
  account: Object.freeze({ maxFailures: 20, delayFrom: 1 }),
});

/**
 * Full model limits for one throttle kind.
 * @param {'pair'|'address'|'account'} kind
 * @returns {{maxFailures: number, delayFrom: number|null, windowMinutes: number, lockMinutes: number, delayCapSeconds: number}}
 */
export function limitsFor(kind) {
  return {
    ...THROTTLE_LIMITS[kind],
    windowMinutes: WINDOW_MINUTES,
    lockMinutes: LOCK_MINUTES,
    delayCapSeconds: DELAY_CAP_SECONDS,
  };
}

const throttlePolicySchema = z.strictObject({ secret: z.string().min(32) });

/**
 * @typedef {object} ThrottlePolicy
 * @property {string} secret HMAC key for throttle keys; at least 32 characters.
 */

/**
 * Validate the configured throttle policy.
 * @param {unknown} policy
 * @returns {ThrottlePolicy}
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parseThrottlePolicy(policy) {
  const result = throttlePolicySchema.safeParse(policy);
  if (!result.success) throw new AdminAuthError('INVALID_INPUT');
  return result.data;
}

/**
 * Derive the stored key for one throttle dimension.
 *
 * HMAC-SHA-256 rather than a bare digest, for the same reason session tokens
 * use one: the key lives in the API, so a stolen `admin.login_throttles` is a
 * list of opaque strings. A plain hash of an email address would be trivially
 * reversible against any address list, which is what M0001-03-R005 and AC05
 * rule out.
 *
 * The kind is part of the message, so an account whose normalized input
 * happens to equal a client address cannot share that address's lock.
 * @param {ThrottlePolicy} policy
 * @param {'pair'|'address'|'account'} kind
 * @param {string} value Normalized account input, client address, or `pairValue`.
 * @returns {string} Hexadecimal HMAC.
 */
export function throttleKey(policy, kind, value) {
  return createHmac('sha256', policy.secret)
    .update(`${kind}:${value}`)
    .digest('hex');
}

/**
 * The value a pair key hashes: account input and client address together.
 *
 * JSON rather than a separator, so no account input containing the separator
 * can make two different pairs hash alike.
 * @param {string} account Normalized account input.
 * @param {string} address Normalized client address.
 * @returns {string}
 */
export function pairValue(account, address) {
  return JSON.stringify([account, address]);
}

/**
 * Reduce a submitted account identifier to the form both the credential
 * lookup and the throttle key use.
 *
 * Applied before validation on purpose. An input that is not an email still
 * throttles, so an attacker cannot reset a window by appending a character
 * that makes the address unparseable.
 * @param {unknown} value
 * @returns {string} Lowercased and trimmed, or the empty string.
 */
export function normalizeAccountInput(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Reduce a client address to a stable form.
 *
 * Node reports an IPv4 peer on a dual-stack socket as `::ffff:203.0.113.7`,
 * while the same peer on an IPv4 socket is `203.0.113.7`. Left alone, the two
 * spellings would be two keys and one client would get ten attempts.
 * @param {unknown} value Value of `request.ip`.
 * @returns {string} The address, or the empty string when it is unknown.
 */
export function normalizeClientAddress(value) {
  if (typeof value !== 'string' || !value) return '';
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/**
 * Seconds a caller must wait, from a lock expiry.
 *
 * Rounded up and floored at one, so a lock with 200 milliseconds left still
 * reports `Retry-After: 1` rather than inviting an immediate retry.
 * @param {Date|string|null|undefined} lockedUntil
 * @returns {number} Whole seconds, at least one.
 */
export function retryAfterSeconds(lockedUntil) {
  const expiry = new Date(lockedUntil ?? 0).getTime();
  if (!Number.isFinite(expiry)) return LOCK_MINUTES * 60;
  return Math.max(1, Math.ceil((expiry - Date.now()) / 1000));
}
