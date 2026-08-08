/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { getDb } from '../../../db/index.js';
import {
  generateRefreshToken,
  parseRefreshToken,
  verifierMatches,
} from '../../../util/tokens.js';
import type { SessionRow } from '../models/Sessions.js';
import { resolveSessionPolicy } from './sessionPolicy.js';
import type { SessionPolicy } from './sessionPolicy.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** What login and refresh need to build cookies and the response body. */
export interface SessionGrant {
  sessionId: string;
  refreshToken: string;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

/**
 * Creates the session row (ADR-0014): the id is generated here because the
 * refresh token embeds it, so token and row must exist together.
 */
export async function createSession(
  userId: string,
  policy: SessionPolicy
): Promise<SessionGrant> {
  const db = getDb();
  const sessionId = randomUUID();
  const { token, tokenHash } = generateRefreshToken(sessionId);
  const idleExpiresAt = new Date(Date.now() + policy.idleMinutes * MINUTE_MS);
  const row = await db.sessions.insert({
    id: sessionId,
    portal_user_id: userId,
    token_hash: tokenHash,
    idle_expires_at: idleExpiresAt,
  });
  return {
    sessionId,
    refreshToken: token,
    idleExpiresAt,
    absoluteExpiresAt: absoluteExpiry(row.created_at, policy),
  };
}

export function absoluteExpiry(createdAt: Date, policy: SessionPolicy): Date {
  return new Date(createdAt.getTime() + policy.absoluteHours * HOUR_MS);
}

export type RefreshResult =
  ({ ok: true; userId: string } & SessionGrant) | { ok: false };

const REFUSED: RefreshResult = { ok: false };

/**
 * The rotation flow of ADR-0014: validate the presented token against the
 * stored hash, refuse expired or revoked sessions, revoke on reuse evidence,
 * and otherwise rotate the hash and slide the idle expiry by the effective
 * policy (recomputed here — see sessionPolicy.ts).
 */
export async function refreshSession(rawToken: string): Promise<RefreshResult> {
  const db = getDb();
  const parsed = parseRefreshToken(rawToken);
  if (parsed === null) {
    return REFUSED;
  }
  const session = await db.sessions.findOneBy([{ id: parsed.sessionId }]);
  if (session === null || session.revoked_at !== null) {
    return REFUSED;
  }
  if (!verifierMatches(parsed.verifier, session.token_hash)) {
    // A live row that no longer matches means the token was already rotated:
    // theft evidence, the session dies (ADR-0014 decision 3).
    await revokeById(parsed.sessionId);
    return REFUSED;
  }

  const policy = await resolveSessionPolicy(session.portal_user_id);
  const now = Date.now();
  if (
    policy === null ||
    now > session.idle_expires_at.getTime() ||
    now > absoluteExpiry(session.created_at, policy).getTime()
  ) {
    return REFUSED;
  }

  const { token, tokenHash } = generateRefreshToken(session.id);
  const idleExpiresAt = new Date(now + policy.idleMinutes * MINUTE_MS);
  // Keyed on the old hash: a concurrent refresh that rotated first leaves
  // zero rows here, which is the same reuse evidence as a replay.
  const rotated = await db.sessions.updateWhere(
    [{ id: session.id, token_hash: session.token_hash }],
    { token_hash: tokenHash, idle_expires_at: idleExpiresAt }
  );
  if (rotated === 0) {
    await revokeById(session.id);
    return REFUSED;
  }
  return {
    ok: true,
    userId: session.portal_user_id,
    sessionId: session.id,
    refreshToken: token,
    idleExpiresAt,
    absoluteExpiresAt: absoluteExpiry(session.created_at, policy),
  };
}

async function revokeById(sessionId: string): Promise<void> {
  const db = getDb();
  await db.sessions.updateWhere([{ id: sessionId, revoked_at: null }], {
    revoked_at: new Date(),
  });
}

/**
 * The session named by the caller's refresh cookie, verified to belong to
 * the authenticated user — how logout and password change identify "this
 * session" (the access JWT carries only `sub` + `ph`).
 */
export async function findOwnedSession(
  rawToken: string | undefined,
  userId: string
): Promise<SessionRow | null> {
  if (rawToken === undefined) {
    return null;
  }
  const parsed = parseRefreshToken(rawToken);
  if (parsed === null) {
    return null;
  }
  const db = getDb();
  const session = await db.sessions.findOneBy([
    { id: parsed.sessionId, portal_user_id: userId },
  ]);
  if (
    session === null ||
    !verifierMatches(parsed.verifier, session.token_hash)
  ) {
    return null;
  }
  return session;
}

/** Logout: revoke exactly this session, idempotently. */
export async function revokeSession(
  sessionId: string,
  userId: string
): Promise<void> {
  const db = getDb();
  await db.sessions.updateWhere(
    [{ id: sessionId, portal_user_id: userId, revoked_at: null }],
    { revoked_at: new Date() }
  );
}

/**
 * Password change revokes every other live session of the user (PRD 0004);
 * the caller's own session survives. With no session to keep (`null` — the
 * caller presented no valid refresh cookie), every live session is revoked.
 */
export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string | null
): Promise<void> {
  const db = getDb();
  await db.sessions.updateWhere(
    [
      {
        portal_user_id: userId,
        revoked_at: null,
        ...(keepSessionId === null ? {} : { id: { $ne: keepSessionId } }),
      },
    ],
    { revoked_at: new Date() }
  );
}
