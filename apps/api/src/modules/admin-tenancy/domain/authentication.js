/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { findCredentialByEmail, findCredentialById } from './credentials.js';
import { AdminAuthError, withAuthErrors } from './errors.js';
import {
  dummyVerify,
  hashPassword,
  needsRehash,
  parseHashingPolicy,
  parsePassword,
  PASSWORD_MAXIMUM,
  verifyPassword,
} from './password.js';
import {
  createSession,
  parseSessionPolicy,
  REVOCATION_CODES,
  revokeSessionsForUser,
  rotateSession,
} from './session.js';
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  normalizeAccountInput,
  normalizeClientAddress,
  parseThrottlePolicy,
  RETENTION_HOURS,
  retryAfterSeconds,
  THROTTLE_KINDS,
  throttleKey,
  WINDOW_MINUTES,
} from './throttle.js';

/** Marker admitting this module, and only this module, to the credential reader. */
const AUTHENTICATION_CONTEXT = Object.freeze({ caller: 'authentication' });

/** Authentication method recorded on a successful login. */
const LOGIN_METHOD = 'password';

/**
 * Stable reasons recorded on `auth.login.failed` and `auth.login.throttled`.
 *
 * Operator-facing only. Every one of them reaches the caller as the same
 * `UNAUTHENTICATED` envelope, which is what AC01 requires; the distinction
 * exists so an operator reading the event history can tell an attack on a real
 * account from address enumeration.
 */
export const FAILURE_CODES = Object.freeze({
  unknownAccount: 'unknown_account',
  badPassword: 'bad_password',
  ineligible: 'ineligible',
  locked: 'locked',
});

/** Failure-window limits passed to the model on every recorded failure. */
const LIMITS = Object.freeze({
  maxFailures: MAX_FAILURES,
  windowMinutes: WINDOW_MINUTES,
  lockMinutes: LOCK_MINUTES,
});

/**
 * @typedef {object} AuthenticationPolicies
 * @property {import('./session.js').SessionPolicy} session Session secret and lifetimes.
 * @property {import('./password.js').HashingPolicy} hashing Argon2id parameters.
 * @property {import('./throttle.js').ThrottlePolicy} throttle Throttle-key secret.
 */

/**
 * Validate the three policies an authentication operation needs.
 *
 * Kept as one call so a route cannot pass two of the three and discover the
 * third was missing halfway through a transaction.
 * @param {unknown} policies
 * @returns {AuthenticationPolicies}
 * @throws {AdminAuthError} `INVALID_INPUT`
 */
export function parseAuthenticationPolicies(policies) {
  if (!policies || typeof policies !== 'object')
    throw new AdminAuthError('INVALID_INPUT');
  const { session, hashing, throttle } = policies;
  try {
    return {
      session: parseSessionPolicy(session),
      hashing: parseHashingPolicy(hashing),
      throttle: parseThrottlePolicy(throttle),
    };
  } catch {
    throw new AdminAuthError('INVALID_INPUT');
  }
}

/**
 * Append one authentication event inside the caller's transaction.
 * @param {object} db
 * @param {object} event Catalogue key, outcome, attribution, and details.
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function appendAuthEvent(db, event, tx) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), target_type: 'portal_user', ...event },
    { tx }
  );
}

/**
 * Whether a presented password is worth hashing.
 *
 * A value that is not a string, or is longer than the policy permits, cannot
 * match any stored hash, so verifying it would only spend the memory an
 * attacker asked it to spend. Under-length values are verified normally: they
 * cannot match either, but refusing them early would time differently from a
 * wrong password of legal length.
 * @param {unknown} value
 * @returns {boolean}
 */
function verifiable(value) {
  return typeof value === 'string' && [...value].length <= PASSWORD_MAXIMUM;
}

/**
 * Read the credential row behind a submitted account identifier.
 *
 * An identifier that is not an email is not an error here; it is an account
 * that does not exist, and it takes the same path as an address nobody has
 * registered.
 * @param {object} db
 * @param {string} account Normalized account input.
 * @returns {Promise<object|null>}
 */
async function credentialFor(db, account) {
  try {
    return await findCredentialByEmail(db, AUTHENTICATION_CONTEXT, account);
  } catch (error) {
    if (error?.code === 'INVALID_INPUT') return null;
    throw error;
  }
}

/**
 * Verify a portal user's password and open a session.
 *
 * M0001-03-R001 through M0001-03-R004. The order is deliberate and each step
 * depends on the one before it.
 *
 * Throttles are consulted first, so a locked key is refused without a
 * verification and without a credential read — §8's "`THROTTLED` without
 * authentication". The password is then verified *before* the account's status
 * is examined, so a disabled account with the right password costs the same as
 * an active account with the wrong one; testing status first would turn
 * response time into an account-status oracle. An address nobody has
 * registered runs `dummyVerify`, which spends the same work for the same
 * reason.
 *
 * Hashing happens outside any transaction. Argon2id is deliberately slow, and
 * holding a row lock for the duration would let a handful of attempts exhaust
 * the connection pool.
 * @param {object} db Admin database handle with `portal_users`, `login_throttles`, `sessions`, `managed_events`, `cache_revisions`, and `tx`.
 * @param {unknown} policies `{ session, hashing, throttle }`.
 * @param {object} request
 * @param {unknown} request.email Submitted account identifier.
 * @param {unknown} request.password Submitted password.
 * @param {unknown} [request.clientAddress] Value of `request.ip`.
 * @param {string|null} [request.requestId] Correlation identifier.
 * @returns {Promise<{token: string, session: object}>} The only copy of the token that leaves this function.
 * @throws {AdminAuthError} `UNAUTHENTICATED`, `THROTTLED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function login(
  db,
  policies,
  { email, password, clientAddress = null, requestId = null }
) {
  const parsed = parseAuthenticationPolicies(policies);
  const account = normalizeAccountInput(email);
  const accountKey = throttleKey(
    parsed.throttle,
    THROTTLE_KINDS.account,
    account
  );
  const addressKey = throttleKey(
    parsed.throttle,
    THROTTLE_KINDS.address,
    normalizeClientAddress(clientAddress)
  );

  return withAuthErrors(async () => {
    const lock = await db.login_throttles.lockedUntil([accountKey, addressKey]);
    if (lock) {
      const seconds = retryAfterSeconds(lock.locked_until);
      await db.tx(tx =>
        appendAuthEvent(
          db,
          {
            event_key: 'auth.login.throttled',
            outcome: 'denied',
            request_id: requestId,
            details: {
              code: FAILURE_CODES.locked,
              retry_after_seconds: seconds,
              throttle_key: lock.key_hash,
            },
          },
          tx
        )
      );
      throw new AdminAuthError('THROTTLED', seconds);
    }

    const credential = await credentialFor(db, account);
    const verified =
      credential && verifiable(password)
        ? await verifyPassword(credential.password_hash, password)
        : await dummyVerify(parsed.hashing);

    if (!credential || !verified || credential.status !== 'active') {
      const code = !credential
        ? FAILURE_CODES.unknownAccount
        : verified
          ? FAILURE_CODES.ineligible
          : FAILURE_CODES.badPassword;
      await db.tx(async tx => {
        await db.login_throttles.recordFailure(accountKey, LIMITS, { tx });
        await db.login_throttles.recordFailure(addressKey, LIMITS, { tx });
        await db.login_throttles.purgeExpired(RETENTION_HOURS, { tx });
        await appendAuthEvent(
          db,
          {
            event_key: 'auth.login.failed',
            outcome: 'failed',
            request_id: requestId,
            actor_id: credential?.id ?? null,
            target_id: credential?.id ?? null,
            details: { code, throttle_key: accountKey },
          },
          tx
        );
      });
      throw new AdminAuthError('UNAUTHENTICATED');
    }

    const issued = await db.tx(async tx => {
      await db.login_throttles.clear(accountKey, { tx });
      const created = await createSession(
        db,
        parsed.session,
        { portalUserId: credential.id, method: LOGIN_METHOD, requestId },
        { tx }
      );
      await appendAuthEvent(
        db,
        {
          event_key: 'auth.login.succeeded',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: credential.id,
          target_id: credential.id,
          session_id: created.session.id,
          details: { method: LOGIN_METHOD },
        },
        tx
      );
      // `createSession` reads `admin.sessions` alone, so its view reports
      // `restricted: false` for every session. The flag lives on the account,
      // and this is the one place that has already read it.
      return {
        token: created.token,
        session: {
          ...created.session,
          restricted: credential.must_change_password === true,
        },
      };
    });

    // §7's rehash, after the session has committed. An upgrade is a
    // convenience, not part of authenticating: failing it must not cost the
    // caller a session it has already earned.
    if (needsRehash(parsed.hashing, credential.password_hash))
      await upgradeStoredHash(
        db,
        parsed.hashing,
        credential.id,
        /** @type {string} */ (password)
      );
    return issued;
  });
}

/**
 * Rehash a password that was verified under weaker parameters.
 *
 * Its own transaction, run after the login has already committed, and silent
 * on failure. Every outcome an upgrade can reach is one the caller neither
 * caused nor can act on.
 * @param {object} db
 * @param {import('./password.js').HashingPolicy} policy
 * @param {string} portalUserId
 * @param {string} password
 * @returns {Promise<boolean>} Whether the stored hash was replaced.
 */
async function upgradeStoredHash(db, policy, portalUserId, password) {
  try {
    const digest = await hashPassword(policy, password);
    const row = await db.tx(tx =>
      db.portal_users.rehashPassword(portalUserId, digest, { tx })
    );
    return row !== null;
  } catch {
    return false;
  }
}

/**
 * Replace a portal user's password from inside their own session.
 *
 * M0001-03-R002 and M0001-03-R006. The new hash, the cleared
 * `must_change_password` flag, the revocation of every other session, and the
 * rotation of this one commit together; anything that throws leaves the old
 * hash and the old flag exactly as they were.
 *
 * Every other session goes because the old password may be the reason another
 * session exists. This one survives and is rotated instead, which is the
 * password-change row of M0001-04 §7 — the caller keeps working, and the
 * cookie it was carrying a moment ago stops resolving.
 * @param {object} db
 * @param {unknown} policies `{ session, hashing, throttle }`.
 * @param {object} request
 * @param {object} request.session Safe session view of the caller's own session.
 * @param {unknown} request.token The caller's current session token.
 * @param {unknown} request.currentPassword
 * @param {unknown} request.newPassword
 * @param {string|null} [request.requestId]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminAuthError} `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function changePassword(
  db,
  policies,
  { session, token, currentPassword, newPassword, requestId = null }
) {
  const parsed = parseAuthenticationPolicies(policies);
  if (!session?.id || !session?.user) throw new AdminAuthError('INVALID_INPUT');
  const replacement = parsePassword(newPassword);

  return withAuthErrors(async () => {
    const credential = await findCredentialById(
      db,
      AUTHENTICATION_CONTEXT,
      session.user
    );
    // An account archived or disabled between session resolution and this read
    // may not set a password. It is a different refusal from a wrong current
    // password on purpose: the caller proved a live session, so there is
    // nothing to conceal about the account behind it.
    if (!credential || credential.status !== 'active')
      throw new AdminAuthError('FORBIDDEN');
    if (
      !verifiable(currentPassword) ||
      !(await verifyPassword(
        credential.password_hash,
        /** @type {string} */ (currentPassword)
      ))
    )
      throw new AdminAuthError('UNAUTHENTICATED');
    // Reusing the current password would satisfy the length rule while
    // leaving a temporary password in place, which is the one outcome
    // M0001-03-R002 exists to prevent.
    if (replacement === currentPassword)
      throw new AdminAuthError('INVALID_INPUT');

    const digest = await hashPassword(parsed.hashing, replacement);
    return db.tx(async tx => {
      const updated = await db.portal_users.replacePassword(
        session.user,
        digest,
        { tx }
      );
      if (!updated) throw new AdminAuthError('FORBIDDEN');
      await revokeSessionsForUser(
        db,
        {
          portalUserId: session.user,
          exceptSessionId: session.id,
          code: REVOCATION_CODES.passwordChanged,
          requestId,
        },
        { tx }
      );
      const rotated = await rotateSession(db, parsed.session, token, {
        requestId,
        tx,
      });
      await appendAuthEvent(
        db,
        {
          event_key: 'auth.password.changed',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: session.user,
          target_id: session.user,
          session_id: session.id,
          details: { forced: session.restricted === true },
        },
        tx
      );
      return {
        token: rotated.token,
        session: { ...rotated.session, restricted: false },
      };
    });
  });
}

/** Zod shapes for the two request bodies, exported so the router and its tests share one definition. */
export const loginRequestSchema = z.strictObject({
  email: z.string().max(254),
  password: z.string().max(1024),
});

export const passwordChangeRequestSchema = z.strictObject({
  currentPassword: z.string().max(1024),
  newPassword: z.string().max(1024),
});
