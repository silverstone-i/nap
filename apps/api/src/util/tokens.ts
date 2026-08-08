/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

/**
 * The `ph` claim until the RBAC PR computes the real permission hash
 * (ADR-0004 fixes the claims to `sub` + `ph`; ADR-0012 owns the staleness
 * flow that consumes it).
 */
export const PH_PLACEHOLDER = 'rbac-pending';

/** Access-token lifetime (ADR-0014 decision 1). */
export const ACCESS_TOKEN_TTL_SECONDS = 900;

const JWT_ALG = 'HS256';

/** Signs the 15-minute access JWT carrying `sub` + `ph` (ADR-0004/0014). */
export function signAccessToken(
  userId: string,
  secret: Uint8Array
): Promise<string> {
  return new SignJWT({ ph: PH_PLACEHOLDER })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/** The verified identity, or null for a missing/expired/tampered token. */
export async function verifyAccessToken(
  token: string,
  secret: Uint8Array
): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: [JWT_ALG],
    });
    return payload.sub === undefined ? null : { userId: payload.sub };
  } catch {
    return null;
  }
}

/**
 * Refresh tokens are `<sessionId>.<verifier>` — the session row's id plus
 * 256 bits of CSPRNG output. Only `sha256(verifier)` is stored. The embedded
 * id is what makes rotation-reuse detectable with a single `token_hash`
 * column: a replayed (already-rotated) token still names its session row,
 * whose hash no longer matches — theft evidence per ADR-0014 decision 3.
 */
export interface RefreshToken {
  token: string;
  tokenHash: string;
}

export function generateRefreshToken(sessionId: string): RefreshToken {
  const verifier = randomBytes(32).toString('base64url');
  return {
    token: `${sessionId}.${verifier}`,
    tokenHash: hashRefreshVerifier(verifier),
  };
}

/** Splits a presented refresh token; null when the shape is wrong. */
export function parseRefreshToken(
  raw: string
): { sessionId: string; verifier: string } | null {
  const dot = raw.indexOf('.');
  if (dot < 1 || dot === raw.length - 1) {
    return null;
  }
  return { sessionId: raw.slice(0, dot), verifier: raw.slice(dot + 1) };
}

/**
 * Unsalted SHA-256: the verifier is high-entropy CSPRNG output, so stretching
 * buys nothing, and the digest must be deterministic to serve as the stored
 * rotation key.
 */
export function hashRefreshVerifier(verifier: string): string {
  return createHash('sha256').update(verifier).digest('hex');
}

/** Constant-time comparison of a presented verifier against the stored hash. */
export function verifierMatches(verifier: string, storedHash: string): boolean {
  const presented = Buffer.from(hashRefreshVerifier(verifier), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return (
    presented.length === stored.length && timingSafeEqual(presented, stored)
  );
}
