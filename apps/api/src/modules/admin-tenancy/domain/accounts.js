/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminAccountError, withAccountErrors } from './errors.js';
import { parseScope, isTenantPermitted } from './scope.js';
import { parseUuid, parseNormalizedEmail, parseLimit } from './validation.js';
import {
  hashPassword,
  parseHashingPolicy,
  parseTemporaryPassword,
} from './password.js';
import {
  revokeSessionsForUser,
  revokeSessionsForMembership,
  REVOCATION_CODES,
} from './session.js';
import { findPortalUser } from './access.js';
import { COLLECTION_ENTITY } from './cache.js';

/** Member types a membership or provisioning job may carry. */
export const MEMBER_TYPES = Object.freeze([
  'employee',
  'client',
  'vendor_contact',
  'contact',
]);

/** Business codes worth a recorded event when a mutation fails or is denied before completing. */
const AUDITED_FAILURE_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'IDEMPOTENCY_CONFLICT',
]);

/**
 * @typedef {object} AdminAccountsDb
 * @property {import('../models/portal_users.js').PortalUsers} portal_users
 * @property {import('../models/portal_user_tenants.js').PortalUserTenants} portal_user_tenants
 * @property {import('../models/provisioning_jobs.js').ProvisioningJobs} provisioning_jobs
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {import('../models/cache_revisions.js').CacheRevisions} cache_revisions
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

/** Safe projection of `admin.portal_users` for this module's ordinary-user contract. Never `password_hash` or `is_root`. */
export function userView(row) {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    mustChangePassword: row.must_change_password,
    deactivatedAt: row.deactivated_at ?? null,
  };
}

/** Safe projection of `admin.portal_user_tenants`. No column on this table is secret. */
export function membershipView(row) {
  return {
    id: row.id,
    portalUserId: row.portal_user_id,
    tenantId: row.tenant_id,
    memberType: row.member_type,
    status: row.status,
    memberId: row.member_id ?? null,
    ready: row.ready,
    deactivatedAt: row.deactivated_at ?? null,
  };
}

/** Safe projection of `admin.provisioning_jobs`. No column on this table is secret. */
export function jobView(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    membershipId: row.membership_id,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    resultMemberId: row.result_member_id ?? null,
    failureCode: row.failure_code ?? null,
  };
}

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  scope: z.unknown(),
});

/**
 * Validate an account authority: the real operator, and the
 * `admin-tenancy::accounts::read`/`::write` scope built for this request.
 * @param {unknown} authority
 * @returns {{actorId: string, scope: import('./scope.js').AdminAccessScope}}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function requireAuthority(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminAccountError('INVALID_INPUT');
  let scope;
  try {
    scope = parseScope(result.data.scope);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
  return { actorId: result.data.actorId, scope };
}

/**
 * Require platform-level portal-user authority. Gates every user-record
 * operation: a portal user is a platform record with no tenant of its own, so
 * `scope.platformPortalUserRead` (populated only when the caller holds
 * `admin-tenancy::accounts::write`, since every write route builds its scope
 * from that capability) is the whole gate.
 *
 * `authorization.js` currently resolves only root or no platform authority
 * (M0569's role-based `platform_admin`/`support`/`tenant_admin` remains
 * deferred until the tenant-local role catalogue exists in the cell), so today this is either fully
 * granted or fully denied — the same posture `cells.js` and `tenants.js`
 * document for their own capability checks.
 * @param {unknown} authority
 * @returns {{actorId: string, scope: import('./scope.js').AdminAccessScope}}
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`
 */
function requirePlatformAuthority(authority) {
  const granted = requireAuthority(authority);
  if (!granted.scope.platformPortalUserRead)
    throw new AdminAccountError('FORBIDDEN');
  return granted;
}

/**
 * Require that `scope` may act on `tenantId`, for a membership or
 * provisioning-job operation authorized independently of the caller-supplied
 * membership or job UUID (M0001-08-R006).
 *
 * A tenant the scope does not name at all reports `FORBIDDEN`: the caller
 * holds no accounts capability, and refusing every tenant reveals nothing
 * record-specific. A tenant explicitly carved out of a granted scope
 * (support's Napsoft restriction, §4 and §12) reports `NOT_FOUND` instead,
 * identically to a missing record, so the refusal cannot tell a denied
 * caller which tenant UUIDs are Napsoft's — mirroring
 * `domain/session.js`'s `revokeSession`.
 * @param {import('./scope.js').AdminAccessScope} scope
 * @param {string} tenantId
 * @returns {void}
 * @throws {AdminAccountError} `FORBIDDEN`, `NOT_FOUND`
 */
function requireTenantAuthority(scope, tenantId) {
  if (isTenantPermitted(scope, tenantId)) return;
  throw new AdminAccountError(
    scope.deniedTenantIds.includes(tenantId) ? 'NOT_FOUND' : 'FORBIDDEN'
  );
}

/**
 * Validate a UUID argument, reporting the account error code.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseUuidOrAccount(value) {
  try {
    return parseUuid(value);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
}

/**
 * Normalize and validate an email address: trimmed, lowercased, and no
 * longer than 254 characters (M0001-08 §7).
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function normalizeEmail(value) {
  const trimmed =
    typeof value === 'string' ? value.trim().toLowerCase() : value;
  try {
    return parseNormalizedEmail(trimmed);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
}

/**
 * Append one account event inside the caller's transaction, generating a
 * deduplication key unless the event supplies one (the client's
 * `Idempotency-Key`, on a create's success path).
 * @param {AdminAccountsDb} db
 * @param {'user'|'membership'|'provisioning_job'} targetType
 * @param {object} event
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function appendAccountEvent(db, targetType, event, tx) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), target_type: targetType, ...event },
    { tx }
  );
}

/**
 * Append a denied or failed event outside any transaction, minting a fresh
 * deduplication key. Never reuses the client's `Idempotency-Key`: only a
 * recorded success claims it, so a corrected retry with the same key can
 * still succeed. Mirrors `domain/tenants.js`'s `appendFailureEvent`.
 * @param {AdminAccountsDb} db
 * @param {'user'|'membership'|'provisioning_job'} targetType
 * @param {string} eventKey
 * @param {'denied'|'failed'} outcome
 * @param {{requestId: string|null, actorId: string|null}} attribution
 * @returns {Promise<void>}
 */
async function appendFailureEvent(
  db,
  targetType,
  eventKey,
  outcome,
  { requestId, actorId }
) {
  await db.managed_events.append({
    deduplication_key: randomUUID(),
    target_type: targetType,
    event_key: eventKey,
    outcome,
    request_id: requestId,
    actor_id: actorId,
  });
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Advisory lock key serializing concurrent user creation. */
const LOCK_KEY_USERS = "hashtext('admin-tenancy:portal-user-registry')";

const createUserBodySchema = z.strictObject({
  email: z.string().min(1).max(254),
  password: z.string(),
});

/**
 * Validate and normalize a user-creation request body.
 * @param {unknown} body
 * @returns {{email: string, password: string}}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseCreateUserInput(body) {
  const result = createUserBodySchema.safeParse(body);
  if (!result.success) throw new AdminAccountError('INVALID_INPUT');
  const email = normalizeEmail(result.data.email);
  let password;
  try {
    password = parseTemporaryPassword(result.data.password);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
  return { email, password };
}

const idempotencyKeySchema = z.uuid();

/**
 * Validate the required `Idempotency-Key` header.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseIdempotencyKey(value) {
  const result = idempotencyKeySchema.safeParse(value);
  if (!result.success) throw new AdminAccountError('INVALID_INPUT');
  return result.data;
}

/**
 * Resolve a previously recorded `user.created` success for this idempotency
 * key against the current request. Reconstructed entirely from the event's
 * immutable `details` snapshot, never a fresh read of the live
 * `portal_users` row — mirroring `domain/tenants.js`'s `createTenant`.
 * @param {AdminAccountsDb} db
 * @param {string} idempotencyKey
 * @param {{email: string}} normalized
 * @returns {Promise<object|null>}
 * @throws {AdminAccountError} `IDEMPOTENCY_CONFLICT`
 */
async function resolveUserReplay(db, idempotencyKey, normalized) {
  const existing = await db.managed_events.findOneBy({
    deduplication_key: idempotencyKey,
    event_key: 'user.created',
    outcome: 'succeeded',
  });
  if (!existing) return null;
  if (existing.details.email !== normalized.email)
    throw new AdminAccountError('IDEMPOTENCY_CONFLICT');
  return userView({
    id: existing.target_id,
    email: existing.details.email,
    status: 'active',
    must_change_password: existing.details.reset_required,
    deactivated_at: null,
  });
}

/**
 * Create an ordinary portal user, or reuse an existing active one registered
 * under the same email.
 *
 * M0001-08-R001. A non-active portal user already holding this email (locked,
 * disabled, or the root account) is a conflict: creating a duplicate row
 * would violate `portal_users_active_email`, and reuse is only ever correct
 * for an active account.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`; `scope` built for `admin-tenancy::accounts::write`.
 * @param {unknown} hashingPolicy Argon2id parameters, validated only on the create branch.
 * @param {unknown} body `{email, password}`.
 * @param {unknown} idempotencyKeyHeader The raw `Idempotency-Key` header value.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe user view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function createOrReuseUser(
  db,
  authority,
  hashingPolicy,
  body,
  idempotencyKeyHeader,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const granted = requirePlatformAuthority(authority);
      actorId = granted.actorId;
      const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);
      const normalized = parseCreateUserInput(body);

      const replay = await resolveUserReplay(db, idempotencyKey, normalized);
      if (replay) return replay;

      return await db.tx(async tx => {
        await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY_USERS})`);
        const racedReplay = await resolveUserReplay(
          db,
          idempotencyKey,
          normalized
        );
        if (racedReplay) return racedReplay;

        const existing = await db.portal_users.lockActiveByEmail(
          normalized.email,
          { tx }
        );
        if (existing) {
          if (existing.is_root || existing.status !== 'active')
            throw new AdminAccountError('CONFLICT');
          await appendAccountEvent(
            db,
            'user',
            {
              deduplication_key: idempotencyKey,
              event_key: 'user.created',
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: granted.actorId,
              target_id: existing.id,
              details: {
                email: normalized.email,
                reset_required: existing.must_change_password,
              },
            },
            tx
          );
          return userView({ ...existing, deactivated_at: null });
        }

        const policy = parseHashingPolicy(hashingPolicy);
        const digest = await hashPassword(policy, normalized.password);
        const user = await createLoginFromHash(
          db,
          { email: normalized.email, passwordHash: digest },
          { tx }
        );
        await appendAccountEvent(
          db,
          'user',
          {
            deduplication_key: idempotencyKey,
            event_key: 'user.created',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: granted.actorId,
            target_id: user.id,
            details: { email: normalized.email, reset_required: true },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'user', entity: COLLECTION_ENTITY }],
          { tx }
        );
        return userView(user);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'user',
        'user.created',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

/** Raw columns `listUsers` reads before projecting through `userListView`. */
const USER_LIST_COLUMNS = Object.freeze([
  'id',
  'email',
  'status',
  'must_change_password',
  'deactivated_at',
  'is_root',
]);

/**
 * Safe projection for the platform-wide portal-user list only: `userView`
 * plus whether the row is the root account. The root account is otherwise
 * unreachable through this module (every other route's `userView` caller
 * excludes it before it ever gets here — `userView` itself still never
 * exposes `is_root`), but I0002's Portal Users screen must still display it
 * for operator visibility, read-only — `isRoot` is what lets the UI hide
 * Deactivate/Restore for that one row, since `archiveUser`/`restoreUser`
 * both reject `is_root` with `NOT_FOUND` regardless.
 * @param {object} row
 * @returns {object}
 */
function userListView(row) {
  return { ...userView(row), isRoot: Boolean(row.is_root) };
}

const userCursorSchema = z.strictObject({
  v: z.literal(1),
  op: z.literal('listUsers'),
  last: z.uuid(),
});

/**
 * Decode and validate an opaque portal-user-list cursor.
 * @param {unknown} cursor
 * @returns {{id: string}|null}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseUserCursor(cursor) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new AdminAccountError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
  const result = userCursorSchema.safeParse(decoded);
  if (!result.success) throw new AdminAccountError('INVALID_INPUT');
  return { id: result.data.last };
}

/**
 * Encode the next portal-user-list page's cursor.
 * @param {{id: string}|null} nextCursor
 * @returns {string|null}
 */
function encodeUserCursor(nextCursor) {
  if (!nextCursor) return null;
  const payload = { v: 1, op: 'listUsers', last: nextCursor.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Apply the shared 50/100 page limit, reporting the account error code.
 * @param {unknown} value
 * @returns {number}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseLimitOrAccount(value) {
  try {
    return parseLimit(value);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
}

/**
 * List every portal-user account — including root, for operator visibility
 * — in ascending `id` order, paginated by opaque cursor (I0002-R008).
 *
 * Reads with `includeDeactivated: true`: `admin.portal_users` is
 * soft-delete tracked, so an archived account would otherwise vanish from
 * this list entirely — and I0002-R006 requires a Restore action, which has
 * no row to act on if the archived account it targets is unreachable here.
 * `scope.archiveManagement` is granted whenever `platformPortalUserRead` is
 * (both flip together in `accessScope`), so `requirePlatformAuthority`
 * alone is the correct, sufficient gate — no separate archive-specific
 * check is needed the way `findPortalUserIncludingArchived`
 * (domain/access.js) requires one for its single-record read.
 *
 * No filter excludes `is_root`: root is otherwise invisible everywhere else
 * this module reads or writes (`getUser`, `createOrReuseUser`,
 * `archiveUser`, `restoreUser` all refuse to touch it), so listing it here
 * is read-only visibility, not a new way to manage it — `userListView`'s
 * `isRoot` flag is what lets the UI withhold Deactivate/Restore for that
 * one row instead.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`; `scope` built for `admin-tenancy::accounts::read`.
 * @param {{cursor?: unknown, limit?: unknown}} [page]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>} A page of safe user-list views.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL_ERROR`
 */
export async function listUsers(db, authority, { cursor, limit } = {}) {
  requirePlatformAuthority(authority);
  const parsedLimit = parseLimitOrAccount(limit);
  const resumeFrom = parseUserCursor(cursor);
  return withAccountErrors(async () => {
    const page = await db.portal_users.findAfterCursor(
      resumeFrom ?? {},
      parsedLimit,
      ['id'],
      { columnWhitelist: USER_LIST_COLUMNS, includeDeactivated: true }
    );
    return {
      rows: page.rows.map(userListView),
      nextCursor: encodeUserCursor(page.nextCursor),
    };
  });
}

/**
 * Read an ordinary portal user's safe view.
 *
 * Delegates existence and authorization to `domain/access.js`'s
 * `findPortalUser`, which already grants a caller either platform-level
 * portal-user read or an active membership in a tenant the scope permits —
 * then excludes the root account, which this module never manages.
 * @param {AdminAccountsDb} db
 * @param {unknown} scope
 * @param {unknown} userId
 * @returns {Promise<object>} Safe user view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
 */
export async function getUser(db, scope, userId) {
  let parsedScope;
  try {
    parsedScope = parseScope(scope);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
  const id = parseUuidOrAccount(userId);
  return withAccountErrors(async () => {
    const row = await findPortalUser(db, parsedScope, id);
    if (!row || row.is_root) throw new AdminAccountError('NOT_FOUND');
    const detail = await db.portal_users.findOneBy(
      { id },
      { columnWhitelist: ['must_change_password'] }
    );
    if (!detail) throw new AdminAccountError('NOT_FOUND');
    return userView({
      ...row,
      must_change_password: detail.must_change_password,
    });
  });
}

const updateUserBodySchema = z
  .strictObject({
    email: z.string().min(1).max(254).optional(),
    status: z.enum(['active', 'disabled']).optional(),
  })
  .refine(data => data.email !== undefined || data.status !== undefined);

/**
 * Change an ordinary portal user's email, account status, or both.
 *
 * M0001-08-R001. A transition into `disabled` revokes every live session the
 * account holds; a value equal to the account's current one is a no-op that
 * still returns its current view, without recording an event.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority
 * @param {unknown} userId
 * @param {unknown} body `{email?, status?}`, at least one present.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe user view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function updateUser(
  db,
  authority,
  userId,
  body,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  let failureEventKey = 'user.updated';
  try {
    return await withAccountErrors(async () => {
      const granted = requirePlatformAuthority(authority);
      actorId = granted.actorId;
      const id = parseUuidOrAccount(userId);
      const result = updateUserBodySchema.safeParse(body);
      if (!result.success) throw new AdminAccountError('INVALID_INPUT');
      const email =
        result.data.email === undefined
          ? undefined
          : normalizeEmail(result.data.email);
      const status = result.data.status;
      if (status === 'disabled') failureEventKey = 'user.disabled';

      return await db.tx(async tx => {
        const current = await db.portal_users.lockById(id, { tx });
        if (!current || current.is_root || current.deactivated_at)
          throw new AdminAccountError('NOT_FOUND');

        const changedFields = [];
        const dto = {};
        if (email !== undefined && email !== current.email) {
          dto.email = email;
          changedFields.push('email');
        }
        if (status !== undefined && status !== current.status) {
          dto.status = status;
          changedFields.push('status');
        }
        if (changedFields.length === 0) return userView(current);

        const updated = await db.portal_users.update(id, dto, { tx });
        if (!updated) throw new AdminAccountError('NOT_FOUND');

        if (status === 'disabled' && changedFields.includes('status')) {
          await revokeSessionsForUser(
            db,
            {
              portalUserId: id,
              code: REVOCATION_CODES.accountIneligible,
              actorId: granted.actorId,
              requestId,
            },
            { tx }
          );
          await appendAccountEvent(
            db,
            'user',
            {
              event_key: 'user.disabled',
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: granted.actorId,
              target_id: id,
              details: { code: REVOCATION_CODES.accountIneligible },
            },
            tx
          );
        } else {
          await appendAccountEvent(
            db,
            'user',
            {
              event_key: 'user.updated',
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: granted.actorId,
              target_id: id,
              details: { changed_fields: changedFields.join(',') },
            },
            tx
          );
        }
        await db.cache_revisions.advance([{ domain: 'user', entity: id }], {
          tx,
        });
        return userView(updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'user',
        failureEventKey,
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

/**
 * Archive an ordinary portal user.
 *
 * M0001-08-R001. Idempotent: archiving an already-archived user succeeds
 * without a second event or session revocation, so a retried `DELETE`
 * returns `204` either way.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority
 * @param {unknown} userId
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{archived: boolean}>}
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function archiveUser(
  db,
  authority,
  userId,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const granted = requirePlatformAuthority(authority);
      actorId = granted.actorId;
      const id = parseUuidOrAccount(userId);
      return await db.tx(async tx => {
        const current = await db.portal_users.lockById(id, { tx });
        if (!current || current.is_root)
          throw new AdminAccountError('NOT_FOUND');
        if (current.deactivated_at) return { archived: true };

        const removed = await db.portal_users.removeWhere({ id }, { tx });
        if (!removed) throw new AdminAccountError('NOT_FOUND');
        await revokeSessionsForUser(
          db,
          {
            portalUserId: id,
            code: REVOCATION_CODES.accountIneligible,
            actorId: granted.actorId,
            requestId,
          },
          { tx }
        );
        await appendAccountEvent(
          db,
          'user',
          {
            event_key: 'user.archived',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: granted.actorId,
            target_id: id,
            details: { code: REVOCATION_CODES.accountIneligible },
          },
          tx
        );
        await db.cache_revisions.advance([{ domain: 'user', entity: id }], {
          tx,
        });
        return { archived: true };
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'user',
        'user.archived',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

/**
 * Restore an archived portal user, returning it as `disabled`.
 *
 * M0001-08 §7: a restored user is never returned active, so an operator must
 * explicitly re-enable it through `updateUser` after reviewing the account.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority
 * @param {unknown} userId
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe user view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function restoreUser(
  db,
  authority,
  userId,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const granted = requirePlatformAuthority(authority);
      actorId = granted.actorId;
      const id = parseUuidOrAccount(userId);
      return await db.tx(async tx => {
        const current = await db.portal_users.lockById(id, { tx });
        if (!current || current.is_root)
          throw new AdminAccountError('NOT_FOUND');
        if (!current.deactivated_at)
          throw new AdminAccountError('INVALID_STATE');

        await db.portal_users.restoreWhere({ id }, { tx });
        const updated = await db.portal_users.update(
          id,
          { status: 'disabled' },
          { tx }
        );
        await appendAccountEvent(
          db,
          'user',
          {
            event_key: 'user.restored',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: granted.actorId,
            target_id: id,
            details: {},
          },
          tx
        );
        await db.cache_revisions.advance([{ domain: 'user', entity: id }], {
          tx,
        });
        return userView(updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'user',
        'user.restored',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Memberships
// ---------------------------------------------------------------------------

/** Advisory lock key serializing concurrent membership creation. */
const LOCK_KEY_MEMBERSHIPS = "hashtext('admin-tenancy:membership-registry')";

const createMembershipBodySchema = z.strictObject({
  portalUserId: z.uuid(),
  tenantId: z.uuid(),
  memberType: z.enum(MEMBER_TYPES),
});

/**
 * Validate and normalize a membership-creation request body.
 * @param {unknown} body
 * @returns {{portalUserId: string, tenantId: string, memberType: string}}
 * @throws {AdminAccountError} `INVALID_INPUT`
 */
function parseCreateMembershipInput(body) {
  const result = createMembershipBodySchema.safeParse(body);
  if (!result.success) throw new AdminAccountError('INVALID_INPUT');
  return result.data;
}

/**
 * Resolve a previously recorded `membership.created` success for this
 * idempotency key against the current request. Reconstructed entirely from
 * the event's own `tenant_id` column and immutable `details` snapshot, never
 * a fresh read of the live `portal_user_tenants`/`provisioning_jobs` rows —
 * mirroring `domain/tenants.js`'s `createTenant`.
 * @param {AdminAccountsDb} db
 * @param {string} idempotencyKey
 * @param {{portalUserId: string, tenantId: string, memberType: string}} normalized
 * @returns {Promise<{membership: object, job: object}|null>}
 * @throws {AdminAccountError} `IDEMPOTENCY_CONFLICT`
 */
async function resolveMembershipReplay(db, idempotencyKey, normalized) {
  const existing = await db.managed_events.findOneBy({
    deduplication_key: idempotencyKey,
    event_key: 'membership.created',
    outcome: 'succeeded',
  });
  if (!existing) return null;
  const matches =
    existing.tenant_id === normalized.tenantId &&
    existing.details.portal_user_id === normalized.portalUserId &&
    existing.details.member_type === normalized.memberType;
  if (!matches) throw new AdminAccountError('IDEMPOTENCY_CONFLICT');
  return {
    membership: membershipView({
      id: existing.target_id,
      portal_user_id: normalized.portalUserId,
      tenant_id: normalized.tenantId,
      member_type: normalized.memberType,
      status: 'pending',
      member_id: null,
      ready: false,
      deactivated_at: null,
    }),
    job: jobView({
      id: existing.details.job_id,
      tenant_id: normalized.tenantId,
      membership_id: existing.target_id,
      kind: normalized.memberType,
      status: 'queued',
      attempts: 0,
      result_member_id: null,
      failure_code: null,
    }),
  };
}

/**
 * Create a membership and its queued provisioning job.
 *
 * M0001-08-R002, M0001-08-R003, M0001-08-R004, M0001-08-R006. Commits with no
 * cell connection: the job starts `queued` and is picked up by the
 * provisioning workflow entirely out of band (§10, §11). The advisory lock
 * serializes creation attempts, mirroring `registerCell`
 * (`domain/cells.js`), so the one-active-membership-per-pair check and the
 * insert cannot race.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`; `scope` built for `admin-tenancy::accounts::write`.
 * @param {unknown} body `{portalUserId, tenantId, memberType}`.
 * @param {unknown} idempotencyKeyHeader The raw `Idempotency-Key` header value.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{membership: object, job: object}>}
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function createMembership(
  db,
  authority,
  body,
  idempotencyKeyHeader,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const { actorId: resolvedActorId, scope } = requireAuthority(authority);
      actorId = resolvedActorId;
      const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);
      const normalized = parseCreateMembershipInput(body);
      requireTenantAuthority(scope, normalized.tenantId);

      const replay = await resolveMembershipReplay(
        db,
        idempotencyKey,
        normalized
      );
      if (replay) return replay;

      return await db.tx(async tx => {
        await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY_MEMBERSHIPS})`);
        const racedReplay = await resolveMembershipReplay(
          db,
          idempotencyKey,
          normalized
        );
        if (racedReplay) return racedReplay;

        const user = await db.portal_users.findOneBy(
          { id: normalized.portalUserId },
          { tx, columnWhitelist: ['id', 'is_root'] }
        );
        if (!user || user.is_root) throw new AdminAccountError('NOT_FOUND');

        const tenant = await db.tenants.findOneBy(
          { id: normalized.tenantId },
          { tx, columnWhitelist: ['id'] }
        );
        if (!tenant) throw new AdminAccountError('NOT_FOUND');

        const existingMembership =
          await db.portal_user_tenants.lockByUserAndTenant(
            normalized.portalUserId,
            normalized.tenantId,
            { tx }
          );
        if (existingMembership) throw new AdminAccountError('CONFLICT');

        const membership = await db.portal_user_tenants.insert(
          {
            portal_user_id: normalized.portalUserId,
            tenant_id: normalized.tenantId,
            member_type: normalized.memberType,
            status: 'pending',
            member_id: null,
            ready: false,
          },
          { tx, actorId: resolvedActorId }
        );
        const job = await db.provisioning_jobs.insert(
          {
            tenant_id: normalized.tenantId,
            membership_id: membership.id,
            kind: normalized.memberType,
            status: 'queued',
            attempts: 0,
          },
          { tx }
        );
        await appendAccountEvent(
          db,
          'membership',
          {
            deduplication_key: idempotencyKey,
            event_key: 'membership.created',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: resolvedActorId,
            tenant_id: normalized.tenantId,
            target_id: membership.id,
            details: {
              member_type: normalized.memberType,
              portal_user_id: normalized.portalUserId,
              job_id: job.id,
            },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'membership', entity: COLLECTION_ENTITY }],
          { tx }
        );
        return { membership: membershipView(membership), job: jobView(job) };
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'membership',
        'membership.created',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

const updateMembershipBodySchema = z.strictObject({
  status: z.enum(['active', 'suspended']),
});

/**
 * Suspend or reactivate a membership.
 *
 * M0001-08-R002. Suspend clears readiness and revokes every live session
 * selecting the membership's tenant; reactivate returns the membership to
 * `active` without restoring readiness, which requires a successful
 * provisioning result (§7: "no readiness until explicitly reactivated and
 * reprovisioned"). A value equal to the membership's current status is a
 * no-op. The root membership (`member_type IS NULL`) is never a valid target.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} membershipId
 * @param {unknown} body `{status: 'active'|'suspended'}`.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe membership view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function updateMembership(
  db,
  authority,
  membershipId,
  body,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  let failureEventKey = 'membership.suspended';
  try {
    return await withAccountErrors(async () => {
      const { actorId: resolvedActorId, scope } = requireAuthority(authority);
      actorId = resolvedActorId;
      const id = parseUuidOrAccount(membershipId);
      const result = updateMembershipBodySchema.safeParse(body);
      if (!result.success) throw new AdminAccountError('INVALID_INPUT');
      const targetStatus = result.data.status;
      if (targetStatus === 'active') failureEventKey = 'membership.activated';

      return await db.tx(async tx => {
        const membership = await db.portal_user_tenants.lockById(id, { tx });
        if (
          !membership ||
          membership.member_type === null ||
          membership.deactivated_at
        )
          throw new AdminAccountError('NOT_FOUND');
        requireTenantAuthority(scope, membership.tenant_id);

        if (membership.status === targetStatus)
          return membershipView(membership);

        if (targetStatus === 'suspended') {
          if (membership.status !== 'active')
            throw new AdminAccountError('INVALID_STATE');
          const updated = await db.portal_user_tenants.update(
            id,
            { status: 'suspended', ready: false },
            { tx, actorId: resolvedActorId }
          );
          await revokeSessionsForMembership(
            db,
            {
              portalUserId: membership.portal_user_id,
              tenantId: membership.tenant_id,
              code: REVOCATION_CODES.accountIneligible,
              actorId: resolvedActorId,
              requestId,
            },
            { tx }
          );
          await appendAccountEvent(
            db,
            'membership',
            {
              event_key: 'membership.suspended',
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: resolvedActorId,
              tenant_id: membership.tenant_id,
              target_id: id,
              details: {
                from_status: 'active',
                to_status: 'suspended',
                code: REVOCATION_CODES.accountIneligible,
              },
            },
            tx
          );
          await db.cache_revisions.advance(
            [{ domain: 'membership', entity: id }],
            { tx }
          );
          return membershipView(updated);
        }

        if (membership.status !== 'suspended')
          throw new AdminAccountError('INVALID_STATE');
        const updated = await db.portal_user_tenants.update(
          id,
          { status: 'active' },
          { tx, actorId: resolvedActorId }
        );
        await appendAccountEvent(
          db,
          'membership',
          {
            event_key: 'membership.activated',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: resolvedActorId,
            tenant_id: membership.tenant_id,
            target_id: id,
            details: { from_status: 'suspended', to_status: 'active' },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'membership', entity: id }],
          { tx }
        );
        return membershipView(updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'membership',
        failureEventKey,
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

/**
 * Archive a membership.
 *
 * M0001-08-R002. Clears readiness and revokes every live session selecting
 * the membership's tenant. Idempotent: archiving an already-archived
 * membership succeeds without a second event or revocation.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} membershipId
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{archived: boolean}>}
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function archiveMembership(
  db,
  authority,
  membershipId,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const { actorId: resolvedActorId, scope } = requireAuthority(authority);
      actorId = resolvedActorId;
      const id = parseUuidOrAccount(membershipId);
      return await db.tx(async tx => {
        const membership = await db.portal_user_tenants.lockById(id, { tx });
        if (!membership || membership.member_type === null)
          throw new AdminAccountError('NOT_FOUND');
        requireTenantAuthority(scope, membership.tenant_id);
        if (membership.deactivated_at) return { archived: true };

        await db.portal_user_tenants.update(
          id,
          { ready: false },
          { tx, actorId: resolvedActorId }
        );
        const removed = await db.portal_user_tenants.removeWhere(
          { id },
          { tx, actorId: resolvedActorId }
        );
        if (!removed) throw new AdminAccountError('NOT_FOUND');
        await revokeSessionsForMembership(
          db,
          {
            portalUserId: membership.portal_user_id,
            tenantId: membership.tenant_id,
            code: REVOCATION_CODES.accountIneligible,
            actorId: resolvedActorId,
            requestId,
          },
          { tx }
        );
        await appendAccountEvent(
          db,
          'membership',
          {
            event_key: 'membership.archived',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: resolvedActorId,
            tenant_id: membership.tenant_id,
            target_id: id,
            details: { code: REVOCATION_CODES.accountIneligible },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'membership', entity: id }],
          { tx }
        );
        return { archived: true };
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'membership',
        'membership.archived',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

/**
 * Restore an archived membership, returning it as `suspended` with no
 * readiness.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} membershipId
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe membership view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function restoreMembership(
  db,
  authority,
  membershipId,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const { actorId: resolvedActorId, scope } = requireAuthority(authority);
      actorId = resolvedActorId;
      const id = parseUuidOrAccount(membershipId);
      return await db.tx(async tx => {
        const membership = await db.portal_user_tenants.lockById(id, { tx });
        if (!membership || membership.member_type === null)
          throw new AdminAccountError('NOT_FOUND');
        requireTenantAuthority(scope, membership.tenant_id);
        if (!membership.deactivated_at)
          throw new AdminAccountError('INVALID_STATE');

        await db.portal_user_tenants.restoreWhere(
          { id },
          { tx, actorId: resolvedActorId }
        );
        const updated = await db.portal_user_tenants.update(
          id,
          { status: 'suspended', ready: false },
          { tx, actorId: resolvedActorId }
        );
        await appendAccountEvent(
          db,
          'membership',
          {
            event_key: 'membership.restored',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: resolvedActorId,
            tenant_id: membership.tenant_id,
            target_id: id,
            details: { from_status: membership.status, to_status: 'suspended' },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'membership', entity: id }],
          { tx }
        );
        return membershipView(updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'membership',
        'membership.restored',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Provisioning jobs
// ---------------------------------------------------------------------------

/**
 * Read a provisioning job's safe status.
 * @param {AdminAccountsDb} db
 * @param {unknown} scope
 * @param {unknown} jobId
 * @returns {Promise<object>} Safe job view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
 */
export async function getJob(db, scope, jobId) {
  let parsedScope;
  try {
    parsedScope = parseScope(scope);
  } catch {
    throw new AdminAccountError('INVALID_INPUT');
  }
  const id = parseUuidOrAccount(jobId);
  return withAccountErrors(async () => {
    const row = await db.provisioning_jobs.findOneBy({ id });
    if (!row) throw new AdminAccountError('NOT_FOUND');
    requireTenantAuthority(parsedScope, row.tenant_id);
    return jobView(row);
  });
}

/**
 * Requeue a failed provisioning job.
 *
 * Idempotent while already `queued` or `running`: returns the current view
 * unchanged rather than restarting an attempt in progress. Only a `failed`
 * job may be retried; a `completed` job cannot.
 * @param {AdminAccountsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} jobId
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe job view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function retryJob(
  db,
  authority,
  jobId,
  { requestId = null } = {}
) {
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    return await withAccountErrors(async () => {
      const { actorId: resolvedActorId, scope } = requireAuthority(authority);
      actorId = resolvedActorId;
      const id = parseUuidOrAccount(jobId);
      return await db.tx(async tx => {
        const job = await db.provisioning_jobs.lockById(id, { tx });
        if (!job) throw new AdminAccountError('NOT_FOUND');
        requireTenantAuthority(scope, job.tenant_id);
        if (job.status === 'queued' || job.status === 'running')
          return jobView(job);
        if (job.status !== 'failed')
          throw new AdminAccountError('INVALID_STATE');

        const updated = await db.provisioning_jobs.update(
          id,
          { status: 'queued', attempts: job.attempts + 1, failure_code: null },
          { tx }
        );
        await appendAccountEvent(
          db,
          'provisioning_job',
          {
            event_key: 'membership.provisioning.retried',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: resolvedActorId,
            tenant_id: job.tenant_id,
            target_id: id,
            details: { attempt: updated.attempts },
          },
          tx
        );
        return jobView(updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        'provisioning_job',
        'membership.provisioning.retried',
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}

const provisioningResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('completed'), resultMemberId: z.uuid() }),
  z.strictObject({
    kind: z.literal('failed'),
    failureCode: z.string().min(1).max(64),
  }),
]);

/**
 * Accept a trusted provisioning result from the membership-provisioning
 * workflow.
 *
 * Never reachable over HTTP — "the provisioning workflow uses internal
 * transactional methods, not a public result route" (§10). The caller is the
 * trusted workflow itself, so this takes no operator authority; the lock on
 * the job row is what makes a duplicate or out-of-order report safe.
 *
 * M0001-08-R005: a result is matched to its membership and member type
 * entirely through the job it names — `job.membership_id` and `job.kind` are
 * immutable, set once at creation — so there is no caller-supplied
 * membership or tenant identifier this function could be tricked into
 * mismatching. A failure never marks the membership ready.
 * @param {AdminAccountsDb} db
 * @param {unknown} jobId
 * @param {unknown} result `{kind: 'completed', resultMemberId} | {kind: 'failed', failureCode}`.
 * @returns {Promise<object>} Safe job view.
 * @throws {AdminAccountError} `INVALID_INPUT`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function reportProvisioningResult(db, jobId, result) {
  const id = parseUuidOrAccount(jobId);
  const parsed = provisioningResultSchema.safeParse(result);
  if (!parsed.success) throw new AdminAccountError('INVALID_INPUT');
  return withAccountErrors(() =>
    db.tx(async tx => {
      const job = await db.provisioning_jobs.lockById(id, { tx });
      if (!job) throw new AdminAccountError('NOT_FOUND');
      if (job.status !== 'queued' && job.status !== 'running')
        throw new AdminAccountError('INVALID_STATE');
      const membership = await db.portal_user_tenants.lockById(
        job.membership_id,
        { tx }
      );
      if (!membership) throw new AdminAccountError('NOT_FOUND');
      // A late report must not resurrect a membership an operator has since
      // archived, nor ever touch the root membership (`member_type IS
      // NULL`) — this module's own contract never manages either. Leaves
      // the job row untouched, still `queued`/`running`.
      if (membership.deactivated_at || membership.member_type === null)
        throw new AdminAccountError('INVALID_STATE');

      if (parsed.data.kind === 'completed') {
        const updatedJob = await db.provisioning_jobs.update(
          id,
          {
            status: 'completed',
            result_member_id: parsed.data.resultMemberId,
            failure_code: null,
          },
          { tx }
        );
        await db.portal_user_tenants.update(
          membership.id,
          {
            status: 'active',
            ready: true,
            member_id: parsed.data.resultMemberId,
          },
          { tx }
        );
        await appendAccountEvent(
          db,
          'membership',
          {
            event_key: 'membership.provisioning.completed',
            outcome: 'succeeded',
            tenant_id: job.tenant_id,
            target_id: membership.id,
            details: { attempt: job.attempts },
          },
          tx
        );
        await db.cache_revisions.advance(
          [{ domain: 'membership', entity: membership.id }],
          { tx }
        );
        return jobView(updatedJob);
      }

      const updatedJob = await db.provisioning_jobs.update(
        id,
        { status: 'failed', failure_code: parsed.data.failureCode },
        { tx }
      );
      await appendAccountEvent(
        db,
        'membership',
        {
          event_key: 'membership.provisioning.failed',
          outcome: 'failed',
          tenant_id: job.tenant_id,
          target_id: membership.id,
          details: { code: parsed.data.failureCode, attempt: job.attempts },
        },
        tx
      );
      return jobView(updatedJob);
    })
  );
}

/**
 * Insert a login that must change its password at first sign-in, from an
 * already-hashed temporary password. The caller holds the user-registry
 * lock and has checked that no unarchived login uses the email.
 * @param {AdminAccountsDb} db
 * @param {{email: string, passwordHash: string}} login
 * @param {{tx: object}} options
 * @returns {Promise<object>} The new row.
 */
export async function createLoginFromHash(db, { email, passwordHash }, { tx }) {
  return db.portal_users.insert(
    {
      email,
      password_hash: passwordHash,
      must_change_password: true,
      status: 'active',
      is_root: false,
    },
    { tx }
  );
}

/**
 * Apply a tenant's portal-access request to the login and membership
 * (I0004-R024–R029), in the caller's admin transaction. The tenant comes
 * from the cell the request was read from, never from the payload.
 *
 * Row failures return a `failureCode` and change nothing; the caller marks
 * that request `failed`. Membership writes go through the revisioned model,
 * so each change writes its own `admin.outbox` row (R030).
 * @param {AdminAccountsDb} db
 * @param {{tenantId: string, payload: {member_id: string, member_type: string, email: string, enabled: boolean, password_hash?: string}}} request
 * @param {{tx: object}} options
 * @returns {Promise<{failureCode: string} | {failureCode: null, invitationPending: boolean}>}
 */
export async function applyPortalAccess(db, { tenantId, payload }, { tx }) {
  await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY_USERS})`);
  await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY_MEMBERSHIPS})`);
  const email = payload.email.trim().toLowerCase();
  const login = await db.portal_users.lockActiveByEmail(email, { tx });

  if (!payload.enabled) {
    if (!login) return { failureCode: null, invitationPending: false };
    const membership = await db.portal_user_tenants.lockByUserAndTenant(
      login.id,
      tenantId,
      { tx }
    );
    if (!membership || membership.status === 'suspended')
      return { failureCode: null, invitationPending: false };
    if (membership.member_id !== payload.member_id)
      return { failureCode: 'MEMBER_CONFLICT' };
    await db.portal_user_tenants.update(
      membership.id,
      { status: 'suspended', ready: false },
      { tx }
    );
    await revokeSessionsForMembership(
      db,
      {
        portalUserId: login.id,
        tenantId,
        code: REVOCATION_CODES.accountIneligible,
      },
      { tx }
    );
    await db.cache_revisions.advance(
      [{ domain: 'membership', entity: membership.id }],
      { tx }
    );
    return { failureCode: null, invitationPending: false };
  }

  if (!login) {
    const created = await createLoginFromHash(
      db,
      { email, passwordHash: payload.password_hash },
      { tx }
    );
    await db.portal_user_tenants.insert(
      {
        portal_user_id: created.id,
        tenant_id: tenantId,
        member_type: payload.member_type,
        member_id: payload.member_id,
        status: 'pending',
        ready: false,
      },
      { tx }
    );
    await db.cache_revisions.advance(
      [
        { domain: 'user', entity: COLLECTION_ENTITY },
        { domain: 'membership', entity: COLLECTION_ENTITY },
      ],
      { tx }
    );
    return { failureCode: null, invitationPending: false };
  }

  if (login.is_root || login.status === 'disabled')
    return { failureCode: 'LOGIN_UNAVAILABLE' };

  const membership = await db.portal_user_tenants.lockByUserAndTenant(
    login.id,
    tenantId,
    { tx }
  );
  if (membership && membership.member_id !== payload.member_id)
    return { failureCode: 'MEMBER_CONFLICT' };

  const activeElsewhere = await tx.oneOrNone(
    `SELECT id FROM admin.portal_user_tenants
      WHERE portal_user_id=$1 AND tenant_id<>$2 AND status='active'
        AND deactivated_at IS NULL
      LIMIT 1`,
    [login.id, tenantId]
  );
  const status = activeElsewhere ? 'active' : 'pending';

  let invitationPending = false;
  if (!activeElsewhere) {
    if (login.must_change_password) invitationPending = true;
    else
      await db.portal_users.update(
        login.id,
        { password_hash: payload.password_hash, must_change_password: true },
        { tx }
      );
  }

  if (!membership)
    await db.portal_user_tenants.insert(
      {
        portal_user_id: login.id,
        tenant_id: tenantId,
        member_type: payload.member_type,
        member_id: payload.member_id,
        status,
        ready: false,
      },
      { tx }
    );
  else if (membership.status === 'suspended')
    await db.portal_user_tenants.update(
      membership.id,
      { status, member_type: payload.member_type },
      { tx }
    );
  if (!membership || membership.status === 'suspended')
    await db.cache_revisions.advance(
      [{ domain: 'membership', entity: membership?.id ?? COLLECTION_ENTITY }],
      { tx }
    );
  return { failureCode: null, invitationPending };
}
