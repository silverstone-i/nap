/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { CompactSign, compactVerify } from 'jose';
import { z } from 'zod';
import type { AuthConfiguration } from './authConfig.js';

/**
 * Does: Names the host-only authentication cookie.
 * Used by: the resolver and authentication replies.
 */
export const sessionCookieName = 'nap_session';
const referenceSchema = z.strictObject({
  id: z.uuid(),
  secret: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Does: Creates an unpredictable secret for a new session.
 * Called by: session creation.
 */
export function sessionSecret() {
  return randomBytes(32).toString('hex');
}

/**
 * Does: Computes the stored SHA-256 digest of a session secret.
 * Called by: session creation and reference checks.
 */
export function secretDigest(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Does: Compares a stored digest to the cookie secret without content-dependent comparison.
 * Called by: session resolution and logout.
 */
export function matchesSecret(secret: string, digest: string) {
  if (!/^[a-f0-9]{64}$/.test(digest)) return false;
  return timingSafeEqual(
    Buffer.from(secretDigest(secret), 'hex'),
    Buffer.from(digest, 'hex')
  );
}

/**
 * Does: Signs a session identifier and random secret with the configured key.
 * Called by: login after inserting the session.
 */
export function signReference(id: string, secret: string, key: string) {
  return new CompactSign(Buffer.from(JSON.stringify({ id, secret })))
    .setProtectedHeader({ alg: 'HS256' })
    .sign(Buffer.from(key));
}

/**
 * Does: Reads and verifies the single session cookie, returning no reference for malformed input.
 * Called by: request session resolution.
 */
export async function readReference(cookie: string | undefined, key: string) {
  if (!cookie) return undefined;
  const values = cookie
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(sessionCookieName + '='));
  const value = values[0];
  if (values.length !== 1 || !value) return undefined;
  try {
    const token = decodeURIComponent(value.slice(sessionCookieName.length + 1));
    if (token.length > 2048) return undefined;
    const { payload } = await compactVerify(token, Buffer.from(key), {
      algorithms: ['HS256'],
    });
    const parsed = referenceSchema.safeParse(
      JSON.parse(Buffer.from(payload).toString('utf8'))
    );
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Does: Returns matching cookie attributes for creation and deletion.
 * Called by: login and logout replies.
 */
export function cookieOptions(config: AuthConfiguration) {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: '/',
  };
}
