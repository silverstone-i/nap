/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminSessionError, withSessionErrors } from './errors.js';
import { isTenantPermitted, parseScope } from './scope.js';

/** Bytes of entropy in a session token. 256 bits, as M0001-04 §5 requires. */
export const SESSION_TOKEN_BYTES = 32;

/** Characters in the base64url encoding of `SESSION_TOKEN_BYTES`. */
const TOKEN_LENGTH = 43;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Live sessions one portal user may hold. Creating another revokes the oldest. */
export const MAX_ACTIVE_SESSIONS = 10;

/** Minutes between `last_seen_at` refreshes, so an active session does not write on every request. */
export const TOUCH_INTERVAL_MINUTES = 5;

/** Bounds on the configured policy. Wider values are a configuration error, not a preference. */
const policySchema = z.strictObject({
  secret: z.string().min(32),
  idleMinutes: z.number().int().min(1).max(1440),
  absoluteHours: z.number().int().min(1).max(168),
});

/**
 * Marks a rotated token on the session view `resolveSession` returns, when
 * an automatic support-access-expiry downgrade (M0001-09) replaced it. A
 * `Symbol` key rather than a plain property: `JSON.stringify` — and so every
 * JSON response envelope — silently omits symbol-keyed properties, which is
 * what keeps this from ever leaking into an HTTP response the way a plain
 * `rotatedToken` field would. Only `middleware/sessionContext.js` reads it.
 */
export const ROTATED_TOKEN = Symbol('rotatedToken');

/**
 * Reasons recorded on `session.revoked`. Each is a stable code, never a
 * message, so the event catalogue's `code` detail stays free of prose.
 */
export const REVOCATION_CODES = Object.freeze({
  logout: 'logout',
  operator: 'operator',
  sessionCap: 'session_cap',
  accountIneligible: 'account_ineligible',
  passwordChanged: 'password_changed',
});

/**
 * @typedef {object} SessionPolicy
 * @property {string} secret HMAC key for token hashing; at least 32 characters.
 * @property {number} idleMinutes Idle timeout in minutes.
 * @property {number} absoluteHours Absolute lifetime in hours.
 */

/**
 * @typedef {object} AdminSessionDb
 * @property {import('../models/sessions.js').Sessions} sessions
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {import('../models/cache_revisions.js').CacheRevisions} cache_revisions
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

/**
 * Validate the configured session policy.
 * @param {unknown} policy
 * @returns {SessionPolicy}
 * @throws {AdminSessionError} `INVALID_INPUT`
 */
export function parseSessionPolicy(policy) {
  const result = policySchema.safeParse(policy);
  if (!result.success) throw new AdminSessionError('INVALID_INPUT');
  return result.data;
}

/**
 * Generate a session token.
 * @returns {string} 256 bits of randomness in base64url, 43 characters.
 */
export function createSessionToken() {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

/**
 * Hash a session token for storage and lookup.
 *
 * HMAC-SHA-256 rather than a bare digest: the key is held by the API, so a
 * stolen database gives an attacker a list of hashes it cannot invert into
 * usable cookies without also stealing `SESSION_SECRET`. A plain hash of a
 * 256-bit random value would be safe against guessing but would not carry
 * that second factor.
 * @param {SessionPolicy} policy
 * @param {string} token
 * @returns {string} Hexadecimal HMAC.
 */
export function hashSessionToken(policy, token) {
  return createHmac('sha256', policy.secret).update(token).digest('hex');
}

/**
 * Validate a token's shape before it reaches the database.
 *
 * A cookie of the wrong length or alphabet cannot be a token this API issued,
 * so it is refused without a query. That keeps a flood of malformed cookies
 * from becoming a flood of index lookups.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminSessionError} `UNAUTHENTICATED`
 */
export function parseSessionToken(value) {
  if (typeof value !== 'string' || value.length !== TOKEN_LENGTH)
    throw new AdminSessionError('UNAUTHENTICATED');
  if (!TOKEN_PATTERN.test(value))
    throw new AdminSessionError('UNAUTHENTICATED');
  return value;
}

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  scope: z.unknown().optional(),
});

/**
 * @typedef {object} SessionAuthority
 * @property {string} actorId The real operator, who may always act on their own session.
 * @property {import('./scope.js').AdminAccessScope|null} scope Platform revocation
 *   scope, or `null` for a caller with no platform authority. `deniedTenantIds`
 *   carries support's Napsoft restriction.
 */

/**
 * Validate a revocation authority.
 * @param {unknown} authority
 * @returns {SessionAuthority}
 * @throws {AdminSessionError} `INVALID_INPUT`
 */
export function parseSessionAuthority(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminSessionError('INVALID_INPUT');
  const { actorId, scope } = result.data;
  if (scope === undefined || scope === null) return { actorId, scope: null };
  try {
    return { actorId, scope: parseScope(scope) };
  } catch {
    throw new AdminSessionError('INVALID_INPUT');
  }
}

/**
 * Whether an authority may act on a session belonging to `tenantId`.
 *
 * A platform session has no tenant. Only an all-tenant scope reaches one,
 * which is what lets `support` revoke platform sessions while a scope naming
 * individual tenants cannot. A tenant-bearing session goes through the shared
 * tenant rule, so a Napsoft tenant listed in `deniedTenantIds` is refused —
 * M0001-04-R007.
 * @param {import('./scope.js').AdminAccessScope} scope
 * @param {string|null} tenantId
 * @returns {boolean}
 */
export function isSessionPermitted(scope, tenantId) {
  if (tenantId === null || tenantId === undefined)
    return scope.tenantIds === '*';
  return isTenantPermitted(scope, tenantId);
}

/**
 * Reduce a session row to the fields a response may contain.
 *
 * `restricted` is derived from the account's `must_change_password` rather
 * than stored on the session, because M0001-03 clears the flag when the
 * password is replaced and the same session must then stop being restricted
 * without being rotated a second time.
 * @param {object} row Session row from the model, optionally joined to its account.
 * @returns {object} Safe session view; never contains a token or token hash.
 */
export function sessionView(row) {
  return {
    id: row.id,
    user: row.portal_user_id,
    tenant: row.tenant_id ?? null,
    accessMode: row.access_mode,
    effectiveUser: row.effective_user_id ?? null,
    accessReason: row.access_reason ?? null,
    accessExpiresAt: row.access_expires_at ?? null,
    restricted: row.must_change_password === true,
    lastSeenAt: row.last_seen_at,
    idleExpiresAt: row.idle_expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
  };
}

/**
 * Build one `session` revision key.
 * @param {string} id Session UUID.
 * @returns {{domain: 'session', entity: string}}
 */
function revisionKey(id) {
  return { domain: 'session', entity: id };
}

/**
 * Advance the revision keys for a set of sessions inside the caller's
 * transaction, so a session state change and its cache invalidation commit
 * together — M0001-11-R002 and M0001-11-R005.
 * @param {AdminSessionDb} db
 * @param {string[]} ids
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function advanceSessionRevisions(db, ids, tx) {
  if (!ids.length) return;
  await db.cache_revisions.advance(ids.map(revisionKey), { tx });
}

/**
 * Append one session event inside the caller's transaction.
 * @param {AdminSessionDb} db
 * @param {object} event Catalogue key, outcome, attribution, and details.
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function appendSessionEvent(db, event, tx) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), target_type: 'session', ...event },
    { tx }
  );
}

/**
 * Archive a set of sessions, recording one `session.revoked` event each.
 * @param {AdminSessionDb} db
 * @param {{id: string, tenant_id: string|null}[]} sessions
 * @param {{actorId: string|null, requestId: string|null, code: string}} context
 * @param {object} tx
 * @returns {Promise<string[]>} The archived session UUIDs.
 */
async function archiveSessions(db, sessions, context, tx) {
  const archived = [];
  for (const session of sessions) {
    const row = await db.sessions.archiveById(session.id, { tx });
    if (!row) continue;
    archived.push(row.id);
    await appendSessionEvent(
      db,
      {
        event_key: 'session.revoked',
        outcome: 'succeeded',
        request_id: context.requestId ?? null,
        actor_id: context.actorId ?? row.portal_user_id,
        tenant_id: row.tenant_id ?? null,
        target_id: row.id,
        session_id: row.id,
        details: { code: context.code },
      },
      tx
    );
  }
  await advanceSessionRevisions(db, archived, tx);
  return archived;
}

/**
 * Downgrade a support session whose access window has passed, replacing its
 * token in the same transaction.
 *
 * M0001-09 §12: "expiry ... retain[s] the real operator", so a
 * `support.exited` event is recorded even though nothing the operator did
 * triggered this — the passive read that discovered the expiry attributes
 * it. Returns `null`, appending nothing, when a concurrent request already
 * won the race (`Sessions.downgradeExpiredAccess`'s `id`-keyed precondition
 * no longer matches); the caller re-reads the row itself in that case
 * rather than treating it as a failure.
 * @param {AdminSessionDb} db
 * @param {object} row Pre-downgrade session row, from `findByTokenHash`.
 * @param {string} nextHash Hash of the freshly generated replacement token.
 * @param {{requestId: string|null, tx: object}} context
 * @returns {Promise<object|null>} The downgraded row (view columns only), or `null`.
 */
async function downgradeExpiredSupportAccess(
  db,
  row,
  nextHash,
  { requestId, tx }
) {
  const downgraded = await db.sessions.downgradeExpiredAccess(
    row.id,
    nextHash,
    {
      tx,
    }
  );
  if (!downgraded) return null;
  await appendSessionEvent(
    db,
    {
      event_key: 'support.exited',
      outcome: 'succeeded',
      request_id: requestId,
      actor_id: row.portal_user_id,
      effective_user_id: row.effective_user_id ?? null,
      tenant_id: row.tenant_id,
      target_id: row.id,
      session_id: row.id,
      details: {},
    },
    tx
  );
  await advanceSessionRevisions(db, [row.id], tx);
  return downgraded;
}

/**
 * Create a session for an already-verified portal user.
 *
 * M0001-04-R001. Authentication owns password verification and eligibility;
 * this operation trusts its caller and is never reachable from a route
 * directly. The session cap is enforced first, under a row lock, so the
 * eleventh concurrent login cannot slip past it.
 *
 * The returned token is the only copy that ever leaves this function. Store
 * nothing but the hash and hand the token straight to the cookie writer.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {object} request
 * @param {string} request.portalUserId Verified portal user.
 * @param {string} [request.method='password'] Authentication method recorded on the event.
 * @param {string|null} [request.requestId] Correlation identifier.
 * @param {{tx?: object}} [options] Existing transaction to join, so login and session creation commit together.
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminSessionError} `INVALID_INPUT`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function createSession(
  db,
  policy,
  { portalUserId, method = 'password', requestId = null },
  { tx } = {}
) {
  const parsed = parseSessionPolicy(policy);
  if (!z.uuid().safeParse(portalUserId).success)
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () => {
    const run = async transaction => {
      const live = await db.sessions.lockLiveForUser(portalUserId, {
        tx: transaction,
      });
      const excess = live.length - (MAX_ACTIVE_SESSIONS - 1);
      if (excess > 0)
        await archiveSessions(
          db,
          live.slice(0, excess),
          {
            actorId: portalUserId,
            requestId,
            code: REVOCATION_CODES.sessionCap,
          },
          transaction
        );
      const token = createSessionToken();
      const row = await db.sessions.insertSession(
        {
          portalUserId,
          tokenHash: hashSessionToken(parsed, token),
          idleMinutes: parsed.idleMinutes,
          absoluteHours: parsed.absoluteHours,
        },
        { tx: transaction }
      );
      await appendSessionEvent(
        db,
        {
          event_key: 'session.created',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: portalUserId,
          tenant_id: null,
          target_id: row.id,
          session_id: row.id,
          details: { method },
        },
        transaction
      );
      await advanceSessionRevisions(db, [row.id], transaction);
      return { token, session: sessionView(row) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * Resolve a presented token into an authenticated context.
 *
 * M0001-04-R002 and M0001-04-R004. The order matters: shape, then hash
 * lookup, then expiry, then account eligibility. Every rejection reports the
 * same `UNAUTHENTICATED` code, so a caller cannot tell an unknown token from
 * a revoked one or from a disabled account.
 *
 * A session found expired is archived here rather than left to a sweeper,
 * which is what makes `session.expired` an observed event and keeps a stale
 * row from being resurrected by a clock change. Bookkeeping writes happen at
 * most once every `TOUCH_INTERVAL_MINUTES`, so an idle-but-live session costs
 * one indexed read per request.
 *
 * A support session whose `access_expires_at` has passed (M0001-09) is
 * downgraded to a normal session here too, with its token rotated in the
 * same transaction — the PRD's lifecycle table treats access expiry the same
 * as an explicit exit. The rotated token is attached to the returned view
 * under the `ROTATED_TOKEN` symbol, never as an enumerable field, so
 * `middleware/sessionContext.js` can set a fresh cookie without the token
 * ever reaching a JSON response.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Value read from the session cookie.
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} Safe session view; carries a rotated token under
 *   `ROTATED_TOKEN` only when a support-access downgrade just happened.
 * @throws {AdminSessionError} `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function resolveSession(db, policy, token, { requestId } = {}) {
  const parsed = parseSessionPolicy(policy);
  const presented = parseSessionToken(token);
  return withSessionErrors(async () => {
    const hash = hashSessionToken(parsed, presented);
    const row = await db.sessions.findByTokenHash(hash, TOUCH_INTERVAL_MINUTES);
    if (!row) throw new AdminSessionError('UNAUTHENTICATED');
    if (row.expired) {
      await db.tx(async tx => {
        const archived = await db.sessions.archiveById(row.id, { tx });
        if (!archived) return;
        await appendSessionEvent(
          db,
          {
            event_key: 'session.expired',
            outcome: 'succeeded',
            request_id: requestId ?? null,
            actor_id: row.portal_user_id,
            tenant_id: row.tenant_id ?? null,
            target_id: row.id,
            session_id: row.id,
            details: {},
          },
          tx
        );
        await advanceSessionRevisions(db, [row.id], tx);
      });
      throw new AdminSessionError('UNAUTHENTICATED');
    }
    if (row.user_archived || row.user_status !== 'active') {
      await db.tx(tx =>
        archiveSessions(
          db,
          [{ id: row.id, tenant_id: row.tenant_id }],
          {
            actorId: row.portal_user_id,
            requestId: requestId ?? null,
            code: REVOCATION_CODES.accountIneligible,
          },
          tx
        )
      );
      throw new AdminSessionError('UNAUTHENTICATED');
    }
    let rotatedToken = null;
    if (row.access_mode === 'support' && row.access_expired) {
      const next = createSessionToken();
      const downgraded = await db.tx(tx =>
        downgradeExpiredSupportAccess(db, row, hashSessionToken(parsed, next), {
          requestId: requestId ?? null,
          tx,
        })
      );
      if (downgraded) {
        Object.assign(row, downgraded);
        rotatedToken = next;
      } else {
        // Another request already won the downgrade race; its rotation is
        // already committed, so read the current row rather than treat this
        // request as unauthenticated.
        const current = await db.sessions.findById(row.id);
        if (current) Object.assign(row, current);
      }
    }
    if (row.stale) {
      const touched = await db.tx(tx =>
        db.sessions.touch(row.id, parsed.idleMinutes, TOUCH_INTERVAL_MINUTES, {
          tx,
        })
      );
      if (touched) Object.assign(row, touched);
    }
    const view = sessionView(row);
    if (rotatedToken) view[ROTATED_TOKEN] = rotatedToken;
    return view;
  });
}

/**
 * Replace a live session's token.
 *
 * M0001-04-R003 and M0001-04-R006. There is no overlap window: the prior
 * token stops resolving the moment this transaction commits. Concurrent
 * attempts with the same current token serialize on the row, and only the
 * first one matches, so exactly one caller receives a new token and the other
 * is told its token is gone.
 *
 * The session keeps its identifier, so its events, revision key, and any
 * tenant or support context set by M0001-09 survive the rotation, which is
 * M0001-04-R005.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Current token.
 * @param {{requestId?: string|null, tx?: object}} [context]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminSessionError} `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function rotateSession(db, policy, token, { requestId, tx } = {}) {
  const parsed = parseSessionPolicy(policy);
  const presented = parseSessionToken(token);
  return withSessionErrors(async () => {
    const run = async transaction => {
      const next = createSessionToken();
      const row = await db.sessions.rotate(
        hashSessionToken(parsed, presented),
        hashSessionToken(parsed, next),
        parsed.idleMinutes,
        { tx: transaction }
      );
      if (!row) throw new AdminSessionError('UNAUTHENTICATED');
      await appendSessionEvent(
        db,
        {
          event_key: 'session.rotated',
          outcome: 'succeeded',
          request_id: requestId ?? null,
          actor_id: row.portal_user_id,
          effective_user_id: row.effective_user_id ?? null,
          tenant_id: row.tenant_id ?? null,
          target_id: row.id,
          session_id: row.id,
          details: {},
        },
        transaction
      );
      await advanceSessionRevisions(db, [row.id], transaction);
      return { token: next, session: sessionView(row) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * Select a tenant for normal work, replacing the session's token in the
 * same transaction.
 *
 * M0001-09-R001, M0001-09-R005. `Sessions.selectTenant` is a single
 * conditional `UPDATE` keyed on the current token hash and requiring
 * `access_mode='normal'`, so a session already in a support context is
 * refused by that precondition rather than by a separate read-then-write
 * check — "Support contexts cannot nest or switch tenants; exit first."
 * Membership and tenant eligibility are `domain/tenantAccess.js`'s
 * responsibility; this function only performs the write once they have
 * already been confirmed.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Current token.
 * @param {object} request
 * @param {string} request.tenantId
 * @param {string|null} [request.requestId]
 * @param {{tx?: object}} [context]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminSessionError} `INVALID_INPUT`, `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function selectSessionTenant(
  db,
  policy,
  token,
  { tenantId, requestId = null },
  { tx } = {}
) {
  const parsed = parseSessionPolicy(policy);
  const presented = parseSessionToken(token);
  if (!z.uuid().safeParse(tenantId).success)
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () => {
    const run = async transaction => {
      const next = createSessionToken();
      const row = await db.sessions.selectTenant(
        hashSessionToken(parsed, presented),
        hashSessionToken(parsed, next),
        tenantId,
        parsed.idleMinutes,
        { tx: transaction }
      );
      if (!row) throw new AdminSessionError('UNAUTHENTICATED');
      await appendSessionEvent(
        db,
        {
          event_key: 'tenant.selected',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: row.portal_user_id,
          tenant_id: row.tenant_id,
          target_id: row.id,
          session_id: row.id,
          details: {},
        },
        transaction
      );
      await advanceSessionRevisions(db, [row.id], transaction);
      return { token: next, session: sessionView(row) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * Enter a time-limited support context, replacing the session's token in
 * the same transaction.
 *
 * M0001-09-R003, M0001-09-R004, M0001-09-R005. `Sessions.enterSupport`
 * requires `access_mode='normal'`, ruling out nesting; capability, reason,
 * tenant, and effective-user validity are all `domain/tenantAccess.js`'s
 * responsibility.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Current token.
 * @param {object} request
 * @param {string} request.tenantId
 * @param {string|null} [request.effectiveUserId]
 * @param {string} request.reason
 * @param {string|null} [request.requestId]
 * @param {{tx?: object}} [context]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminSessionError} `INVALID_INPUT`, `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function enterSessionSupport(
  db,
  policy,
  token,
  { tenantId, effectiveUserId = null, reason, requestId = null },
  { tx } = {}
) {
  const parsed = parseSessionPolicy(policy);
  const presented = parseSessionToken(token);
  if (!z.uuid().safeParse(tenantId).success)
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () => {
    const run = async transaction => {
      const next = createSessionToken();
      const row = await db.sessions.enterSupport(
        hashSessionToken(parsed, presented),
        hashSessionToken(parsed, next),
        { tenantId, effectiveUserId, reason },
        parsed.idleMinutes,
        { tx: transaction }
      );
      if (!row) throw new AdminSessionError('UNAUTHENTICATED');
      await appendSessionEvent(
        db,
        {
          event_key: 'support.entered',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: row.portal_user_id,
          effective_user_id: row.effective_user_id ?? null,
          tenant_id: row.tenant_id,
          target_id: row.id,
          session_id: row.id,
          details: {},
        },
        transaction
      );
      await advanceSessionRevisions(db, [row.id], transaction);
      return { token: next, session: sessionView(row) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * Exit a support context, replacing the session's token in the same
 * transaction.
 *
 * M0001-09-R005. `Sessions.exitSupport` requires `access_mode='support'`.
 * The pre-exit `tenantId`/`effectiveUserId` are supplied by the caller
 * (already known from the resolved session) because the `RETURNING` row has
 * already cleared them by the time this function's event is recorded.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Current token.
 * @param {object} request
 * @param {string|null} request.tenantId Pre-exit tenant, for the event.
 * @param {string|null} [request.effectiveUserId] Pre-exit effective user, for the event.
 * @param {string|null} [request.requestId]
 * @param {{tx?: object}} [context]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminSessionError} `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function exitSessionSupport(
  db,
  policy,
  token,
  { tenantId = null, effectiveUserId = null, requestId = null },
  { tx } = {}
) {
  const parsed = parseSessionPolicy(policy);
  const presented = parseSessionToken(token);
  return withSessionErrors(async () => {
    const run = async transaction => {
      const next = createSessionToken();
      const row = await db.sessions.exitSupport(
        hashSessionToken(parsed, presented),
        hashSessionToken(parsed, next),
        parsed.idleMinutes,
        { tx: transaction }
      );
      if (!row) throw new AdminSessionError('UNAUTHENTICATED');
      await appendSessionEvent(
        db,
        {
          event_key: 'support.exited',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: row.portal_user_id,
          effective_user_id: effectiveUserId,
          tenant_id: tenantId,
          target_id: row.id,
          session_id: row.id,
          details: {},
        },
        transaction
      );
      await advanceSessionRevisions(db, [row.id], transaction);
      return { token: next, session: sessionView(row) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * End the session a cookie points at.
 *
 * Logout accepts a token that is unknown, expired, or already revoked and
 * reports success either way, because the browser must be able to discard a
 * cookie it can no longer use. Only a token that actually archived a row
 * records an event.
 * @param {AdminSessionDb} db
 * @param {unknown} policy
 * @param {unknown} token Value read from the session cookie.
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<{revoked: boolean}>}
 * @throws {AdminSessionError} `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function logoutSession(db, policy, token, { requestId } = {}) {
  const parsed = parseSessionPolicy(policy);
  let presented;
  try {
    presented = parseSessionToken(token);
  } catch {
    return { revoked: false };
  }
  return withSessionErrors(async () =>
    db.tx(async tx => {
      const row = await db.sessions.archiveByTokenHash(
        hashSessionToken(parsed, presented),
        { tx }
      );
      if (!row) return { revoked: false };
      await appendSessionEvent(
        db,
        {
          event_key: 'session.revoked',
          outcome: 'succeeded',
          request_id: requestId ?? null,
          actor_id: row.portal_user_id,
          tenant_id: row.tenant_id ?? null,
          target_id: row.id,
          session_id: row.id,
          details: { code: REVOCATION_CODES.logout },
        },
        tx
      );
      await advanceSessionRevisions(db, [row.id], tx);
      return { revoked: true };
    })
  );
}

/**
 * Revoke one session by identifier.
 *
 * M0001-04-R003 and M0001-04-R007. Authority is decided from the session's
 * owner and tenant before anything else happens: a caller revoking its own
 * session needs no scope, and any other caller needs a scope that permits the
 * session's tenant. A `support` scope carries the Napsoft tenants in
 * `deniedTenantIds`, so a session targeting one is refused — and refused
 * identically to a session that does not exist, so the refusal does not
 * reveal which tenant UUIDs are Napsoft's.
 *
 * Revoking an already-revoked session succeeds without recording a second
 * event, so a retried request is idempotent.
 * @param {AdminSessionDb} db
 * @param {unknown} authority `{ actorId, scope }`; `scope` is `null` for a caller with no platform authority.
 * @param {unknown} sessionId
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<{revoked: boolean}>}
 * @throws {AdminSessionError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function revokeSession(
  db,
  authority,
  sessionId,
  { requestId } = {}
) {
  const parsedAuthority = parseSessionAuthority(authority);
  if (!z.uuid().safeParse(sessionId).success)
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () =>
    db.tx(async tx => {
      const existing = await db.sessions.findAnyById(sessionId, { tx });
      const own = existing?.portal_user_id === parsedAuthority.actorId;
      const permitted =
        own ||
        (existing !== null &&
          parsedAuthority.scope !== null &&
          isSessionPermitted(parsedAuthority.scope, existing.tenant_id));
      if (!permitted) throw new AdminSessionError('FORBIDDEN');
      if (existing.deactivated_at !== null) return { revoked: false };
      const archived = await archiveSessions(
        db,
        [{ id: existing.id, tenant_id: existing.tenant_id }],
        {
          actorId: parsedAuthority.actorId,
          requestId: requestId ?? null,
          code: own ? REVOCATION_CODES.logout : REVOCATION_CODES.operator,
        },
        tx
      );
      return { revoked: archived.length > 0 };
    })
  );
}

/**
 * Revoke every live session for a portal user, optionally sparing one.
 *
 * The seam M0001-03 uses when a password changes and M0001-08 uses when an
 * account is disabled or archived. Pass `tx` so the account change and the
 * revocations commit together; a caller that revokes outside the source
 * transaction can leave a disabled account holding a usable cookie.
 * @param {AdminSessionDb} db
 * @param {object} request
 * @param {string} request.portalUserId
 * @param {string|null} [request.exceptSessionId] Session to keep, such as the one changing the password.
 * @param {string} [request.code] A value of `REVOCATION_CODES`.
 * @param {string|null} [request.actorId] Operator responsible, when it is not the account holder.
 * @param {string|null} [request.requestId]
 * @param {{tx?: object}} [options]
 * @returns {Promise<{revoked: string[]}>} The archived session UUIDs.
 * @throws {AdminSessionError} `INVALID_INPUT`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function revokeSessionsForUser(
  db,
  {
    portalUserId,
    exceptSessionId = null,
    code = REVOCATION_CODES.accountIneligible,
    actorId = null,
    requestId = null,
  },
  { tx } = {}
) {
  if (!z.uuid().safeParse(portalUserId).success)
    throw new AdminSessionError('INVALID_INPUT');
  if (exceptSessionId !== null && !z.uuid().safeParse(exceptSessionId).success)
    throw new AdminSessionError('INVALID_INPUT');
  if (!Object.values(REVOCATION_CODES).includes(code))
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () => {
    const run = async transaction => {
      const rows = await db.sessions.archiveForUser(
        portalUserId,
        exceptSessionId,
        { tx: transaction }
      );
      for (const row of rows)
        await appendSessionEvent(
          db,
          {
            event_key: 'session.revoked',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: actorId ?? portalUserId,
            tenant_id: row.tenant_id ?? null,
            target_id: row.id,
            session_id: row.id,
            details: { code },
          },
          transaction
        );
      await advanceSessionRevisions(
        db,
        rows.map(row => row.id),
        transaction
      );
      return { revoked: rows.map(row => row.id) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}

/**
 * Revoke every live session a portal user holds for one tenant.
 *
 * The seam M0001-08 uses when a membership is suspended or archived: only
 * sessions that selected the affected tenant are revoked, unlike
 * `revokeSessionsForUser`, which ends every session the account holds. Pass
 * `tx` so the membership change and the revocations commit together.
 * @param {AdminSessionDb} db
 * @param {object} request
 * @param {string} request.portalUserId
 * @param {string} request.tenantId
 * @param {string} [request.code] A value of `REVOCATION_CODES`.
 * @param {string|null} [request.actorId] Operator responsible, when it is not the account holder.
 * @param {string|null} [request.requestId]
 * @param {{tx?: object}} [options]
 * @returns {Promise<{revoked: string[]}>} The archived session UUIDs.
 * @throws {AdminSessionError} `INVALID_INPUT`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function revokeSessionsForMembership(
  db,
  {
    portalUserId,
    tenantId,
    code = REVOCATION_CODES.accountIneligible,
    actorId = null,
    requestId = null,
  },
  { tx } = {}
) {
  if (!z.uuid().safeParse(portalUserId).success)
    throw new AdminSessionError('INVALID_INPUT');
  if (!z.uuid().safeParse(tenantId).success)
    throw new AdminSessionError('INVALID_INPUT');
  if (!Object.values(REVOCATION_CODES).includes(code))
    throw new AdminSessionError('INVALID_INPUT');
  return withSessionErrors(async () => {
    const run = async transaction => {
      const rows = await db.sessions.archiveForUserAndTenant(
        portalUserId,
        tenantId,
        { tx: transaction }
      );
      for (const row of rows)
        await appendSessionEvent(
          db,
          {
            event_key: 'session.revoked',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: actorId ?? portalUserId,
            tenant_id: row.tenant_id ?? null,
            target_id: row.id,
            session_id: row.id,
            details: { code },
          },
          transaction
        );
      await advanceSessionRevisions(
        db,
        rows.map(row => row.id),
        transaction
      );
      return { revoked: rows.map(row => row.id) };
    };
    return tx ? run(tx) : db.tx(run);
  });
}
