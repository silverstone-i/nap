/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AdminEventError, withEventErrors } from './errors.js';
import { parseScope, isTenantPermitted } from './scope.js';
import { parseLimit } from './validation.js';
import { parseEventCursor, encodeEventCursor } from './cursor.js';

/** Outcomes permitted by the `admin.managed_events` check constraint. */
export const EVENT_OUTCOMES = Object.freeze(['succeeded', 'failed', 'denied']);

/** Outcomes for a mutation whose key does not already name one. */
const ANY_OUTCOME = EVENT_OUTCOMES;
const SUCCEEDED = Object.freeze(['succeeded']);
const FAILED = Object.freeze(['failed']);
const DENIED = Object.freeze(['denied']);

/**
 * Detail keys any event may carry. Every key is a stable code, a count, a
 * public identifier, or a keyed hash. `throttle_key` is the last of those: an
 * HMAC taken under a secret the API holds, which is how a login failure is
 * attributed to an account or a client without M0001-03-R005's forbidden raw
 * email or raw address ever reaching the event store.
 *
 * Nothing here can hold a password, hash, session token, connection string,
 * raw throttle input, or provider secret, which is what M0001-12-R007 forbids; `parseDetails` enforces the per-event subset and the
 * value shapes, and a unit test asserts this vocabulary against a denylist so
 * a later Work Unit cannot widen it into a leak.
 */
export const EVENT_DETAIL_KEYS = Object.freeze([
  'attempt',
  'cell_code',
  'changed_fields',
  'code',
  'email',
  'forced',
  'from_enabled',
  'from_status',
  'job_id',
  'member_type',
  'method',
  'module_key',
  'name',
  'portal_user_id',
  'previous_session_id',
  'region',
  'reset_required',
  'retry_after_seconds',
  'revision',
  'role',
  'step',
  'tenant_code',
  'throttle_key',
  'tier',
  'to_enabled',
  'to_status',
]);

/**
 * Every administrative event key, with the outcomes it may record and the
 * detail keys it may carry. M0001-12-R001 requires originating operations to
 * use these keys; a key absent here cannot be appended.
 *
 * A key that already names its outcome (`.succeeded`, `.failed`, `.completed`,
 * `.throttled`, `.denied`) is pinned to that one outcome, so the key and the
 * `outcome` column can never disagree. Every other key names a mutation that
 * can succeed, fail, or be denied, and the column carries which.
 */
export const EVENT_CATALOGUE = Object.freeze({
  'bootstrap.succeeded': { outcomes: SUCCEEDED, details: ['step'] },
  'bootstrap.failed': { outcomes: FAILED, details: ['step', 'code'] },

  'auth.login.succeeded': { outcomes: SUCCEEDED, details: ['method'] },
  'auth.login.failed': { outcomes: FAILED, details: ['code', 'throttle_key'] },
  'auth.login.throttled': {
    outcomes: DENIED,
    details: ['code', 'retry_after_seconds', 'throttle_key'],
  },
  'auth.password.changed': { outcomes: ANY_OUTCOME, details: ['forced'] },

  'session.created': { outcomes: ANY_OUTCOME, details: ['method'] },
  'session.rotated': {
    outcomes: ANY_OUTCOME,
    details: ['previous_session_id'],
  },
  'session.revoked': { outcomes: ANY_OUTCOME, details: ['code'] },
  'session.expired': { outcomes: SUCCEEDED, details: [] },

  'role.initialized': { outcomes: ANY_OUTCOME, details: ['role'] },
  'role.granted': { outcomes: ANY_OUTCOME, details: ['role'] },
  'role.revoked': { outcomes: ANY_OUTCOME, details: ['role'] },

  'cell.registered': {
    outcomes: ANY_OUTCOME,
    details: ['cell_code', 'region'],
  },
  'cell.retry.requested': { outcomes: ANY_OUTCOME, details: ['attempt'] },
  'cell.provisioning.failed': {
    outcomes: FAILED,
    details: ['step', 'code', 'attempt'],
  },
  'cell.provisioning.completed': {
    outcomes: SUCCEEDED,
    details: ['attempt'],
  },
  'cell.disabled': { outcomes: ANY_OUTCOME, details: ['code'] },

  'tenant.created': {
    outcomes: ANY_OUTCOME,
    // `name` is stored so a repeated `Idempotency-Key` can compare the full
    // normalized request against the immutable snapshot this event recorded,
    // not against the live (possibly later-edited) `tenants` row.
    details: ['tenant_code', 'tier', 'name'],
  },

  'user.created': {
    outcomes: ANY_OUTCOME,
    // `email` and `reset_required` are stored so a repeated
    // `Idempotency-Key` can compare against, and replay, the immutable
    // snapshot this event recorded, not a live (possibly later-edited)
    // `portal_users` row.
    details: ['email', 'reset_required'],
  },
  'user.updated': { outcomes: ANY_OUTCOME, details: ['changed_fields'] },
  'user.disabled': { outcomes: ANY_OUTCOME, details: ['code'] },
  'user.archived': { outcomes: ANY_OUTCOME, details: ['code'] },
  'user.restored': { outcomes: ANY_OUTCOME, details: [] },
  'membership.created': {
    outcomes: ANY_OUTCOME,
    // `portal_user_id` and `job_id` complete the immutable snapshot an
    // `Idempotency-Key` replay reconstructs: `tenant_id` is already a native
    // column, and the membership's own id is `target_id`.
    details: ['member_type', 'portal_user_id', 'job_id'],
  },
  'membership.suspended': {
    outcomes: ANY_OUTCOME,
    details: ['from_status', 'to_status', 'code'],
  },
  'membership.activated': {
    outcomes: ANY_OUTCOME,
    details: ['from_status', 'to_status'],
  },
  'membership.archived': {
    outcomes: ANY_OUTCOME,
    details: ['from_status', 'to_status', 'code'],
  },
  'membership.restored': {
    outcomes: ANY_OUTCOME,
    details: ['from_status', 'to_status'],
  },
  'membership.provisioning.retried': {
    outcomes: ANY_OUTCOME,
    details: ['attempt'],
  },
  'membership.provisioning.failed': {
    outcomes: FAILED,
    details: ['step', 'code', 'attempt'],
  },
  'membership.provisioning.completed': {
    outcomes: SUCCEEDED,
    details: ['attempt'],
  },

  'tenant.selected': { outcomes: ANY_OUTCOME, details: [] },
  'support.entered': { outcomes: ANY_OUTCOME, details: [] },
  'support.exited': { outcomes: ANY_OUTCOME, details: [] },
  'support.denied': { outcomes: DENIED, details: ['code'] },

  'entitlement.granted': {
    outcomes: ANY_OUTCOME,
    // `from_enabled`/`to_enabled`/`revision` complete the M0001-10 §12
    // audit record: the current `module_entitlements` row can change again
    // later, so its state at the time of this event must be captured here
    // rather than left to be inferred from the (mutable) row.
    details: ['module_key', 'from_enabled', 'to_enabled', 'revision'],
  },
  'entitlement.withdrawn': {
    outcomes: ANY_OUTCOME,
    details: ['module_key', 'from_enabled', 'to_enabled', 'revision'],
  },

  'cache.revision.failed': { outcomes: FAILED, details: ['code'] },
});

/**
 * Safe projection of `admin.managed_events`. No column on this table is
 * secret; the redaction that matters happens on the way in, in `parseDetails`.
 * `occurred_at` and `id` must stay listed because they order every page.
 */
export const EVENT_VIEW_COLUMNS = Object.freeze([
  'id',
  'deduplication_key',
  'occurred_at',
  'request_id',
  'event_key',
  'outcome',
  'actor_id',
  'effective_user_id',
  'tenant_id',
  'target_type',
  'target_id',
  'session_id',
  'reason',
  'details',
]);

/** Columns an originating operation supplies. `occurred_at` and `id` default in PostgreSQL, so an event cannot be backdated. */
export const EVENT_INSERT_COLUMNS = Object.freeze([
  'deduplication_key',
  'request_id',
  'event_key',
  'outcome',
  'actor_id',
  'effective_user_id',
  'tenant_id',
  'target_type',
  'target_id',
  'session_id',
  'reason',
  'details',
]);

const optionalUuid = z.uuid().nullish().transform(withNull);
const eventSchema = z.strictObject({
  deduplication_key: z.uuid(),
  event_key: z.string(),
  outcome: z.enum(EVENT_OUTCOMES),
  request_id: optionalUuid,
  actor_id: optionalUuid,
  effective_user_id: optionalUuid,
  tenant_id: optionalUuid,
  target_id: optionalUuid,
  session_id: optionalUuid,
  target_type: z.string().min(1).max(64).nullish().transform(withNull),
  reason: z.string().min(1).max(512).nullish().transform(withNull),
  details: z.unknown().optional(),
});

function withNull(value) {
  return value ?? null;
}

/**
 * Validate an event's detail object against its key's allowlist.
 *
 * Values are restricted to strings, finite numbers, booleans, and null.
 * Rejecting objects and arrays is what makes the allowlist total: a nested
 * value could otherwise carry an unlisted key past the check and into the
 * stored `details` column.
 * @param {string} eventKey A key already confirmed present in the catalogue.
 * @param {unknown} details
 * @returns {Record<string, string|number|boolean|null>}
 * @throws {AdminEventError} `INVALID_INPUT`
 */
export function parseDetails(eventKey, details) {
  if (details === undefined || details === null) return {};
  if (typeof details !== 'object' || Array.isArray(details))
    throw new AdminEventError('INVALID_INPUT');
  const allowed = new Set(EVENT_CATALOGUE[eventKey].details);
  const parsed = {};
  for (const [key, value] of Object.entries(details)) {
    if (!allowed.has(key)) throw new AdminEventError('INVALID_INPUT');
    const acceptable =
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= 256);
    if (!acceptable) throw new AdminEventError('INVALID_INPUT');
    parsed[key] = value;
  }
  return parsed;
}

/**
 * Validate an event and return the row to insert.
 *
 * Checks the key against the catalogue, the outcome against that key's
 * permitted outcomes, and the attribution, target, and detail fields, which is
 * the validation M0001-12-R002 requires before insertion.
 * @param {unknown} event
 * @returns {Record<string, unknown>}
 * @throws {AdminEventError} `INVALID_INPUT`
 */
export function parseEvent(event) {
  const result = eventSchema.safeParse(event);
  if (!result.success) throw new AdminEventError('INVALID_INPUT');
  const parsed = result.data;
  const entry = EVENT_CATALOGUE[parsed.event_key];
  if (!Object.hasOwn(EVENT_CATALOGUE, parsed.event_key) || !entry)
    throw new AdminEventError('INVALID_INPUT');
  if (!entry.outcomes.includes(parsed.outcome))
    throw new AdminEventError('INVALID_INPUT');
  return { ...parsed, details: parseDetails(parsed.event_key, parsed.details) };
}

/**
 * Translate an authorization scope into the conditions a reader's events must
 * satisfy.
 *
 * Returns `null` when the scope permits no events at all, so the caller can
 * answer with an empty page instead of querying. An empty array means the
 * scope reads every event.
 *
 * A scope covering every tenant also reads events with no tenant — bootstrap,
 * cell registration, and a session created before tenant selection. A scope
 * naming its tenants does not: `$in` never matches NULL, which is the
 * fail-closed half of the PRD's reader-scope table. The denial branch needs
 * its NULL case spelled out for the opposite reason: `tenant_id <> $1` is
 * NULL, not true, when `tenant_id` is NULL, so support would otherwise lose
 * every platform event.
 * @param {import('./scope.js').AdminAccessScope} scope
 * @returns {object[]|null}
 */
export function eventScopeFilter(scope) {
  if (scope.tenantIds === '*') {
    if (!scope.deniedTenantIds.length) return [];
    return [
      {
        $or: [
          { tenant_id: { $is: null } },
          {
            $and: scope.deniedTenantIds.map(id => ({
              tenant_id: { $ne: id },
            })),
          },
        ],
      },
    ];
  }
  const permitted = scope.tenantIds.filter(
    id => !scope.deniedTenantIds.includes(id)
  );
  return permitted.length ? [{ tenant_id: { $in: permitted } }] : null;
}

const filterSchema = z.strictObject({
  tenant: z.uuid().optional(),
  actor: z.uuid().optional(),
  event: z.string().optional(),
  outcome: z.enum(EVENT_OUTCOMES).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().optional(),
});

/**
 * Hash the conditions a page was issued under, so a cursor cannot be replayed
 * against a widened filter or a different reader.
 * @param {object[]} conditions
 * @returns {string}
 */
function fingerprint(conditions) {
  return createHash('sha256').update(JSON.stringify(conditions)).digest('hex');
}

/**
 * Read an authorized, filtered, paginated page of administrative events.
 *
 * A tenant filter naming a tenant the scope does not permit returns an empty
 * page rather than `FORBIDDEN`. Distinguishing the two would tell a support
 * caller that a given tenant UUID is one of the Napsoft tenants it is denied,
 * which is the inference M0001-12-R004 and AC05 rule out.
 * @param {{managed_events: import('../models/managed_events.js').ManagedEvents}} db
 * @param {unknown} scope
 * @param {{tenant?: string, actor?: string, event?: string, outcome?: string, from?: string, to?: string, cursor?: string, limit?: number}} [filters]
 * @returns {Promise<{rows: object[], nextCursor: string|null}>}
 * @throws {AdminEventError} `INVALID_INPUT`, `CONFLICT`, or `INTERNAL_ERROR`
 */
export async function listEvents(db, scope, filters = {}) {
  const parsedScope = parseScope(scope);
  const parsedFilters = filterSchema.safeParse(filters);
  if (!parsedFilters.success) throw new AdminEventError('INVALID_INPUT');
  const query = parsedFilters.data;
  if (query.event && !Object.hasOwn(EVENT_CATALOGUE, query.event))
    throw new AdminEventError('INVALID_INPUT');
  // Compared as instants, not as text. The schema accepts offsets, and
  // lexicographic order disagrees with chronological order across them:
  // `2026-09-19T23:00:00+05:00` sorts after `2026-09-19T20:00:00Z` but
  // happens two hours earlier.
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to))
    throw new AdminEventError('INVALID_INPUT');
  const limit = parseLimitOrInvalid(query.limit);

  const scopeConditions = eventScopeFilter(parsedScope);
  const permitsRequestedTenant =
    !query.tenant || isTenantPermitted(parsedScope, query.tenant);
  if (!scopeConditions || !permitsRequestedTenant)
    return { rows: [], nextCursor: null };

  const conditions = [...scopeConditions];
  if (query.tenant) conditions.push({ tenant_id: { $eq: query.tenant } });
  if (query.actor) conditions.push({ actor_id: { $eq: query.actor } });
  if (query.event) conditions.push({ event_key: { $eq: query.event } });
  if (query.outcome) conditions.push({ outcome: { $eq: query.outcome } });
  if (query.from || query.to) {
    const range = {};
    if (query.from) range.$from = query.from;
    if (query.to) range.$to = query.to;
    conditions.push({ occurred_at: range });
  }

  const pageFingerprint = fingerprint(conditions);
  const resumeFrom = parseEventCursor(query.cursor, pageFingerprint);
  return withEventErrors(async () => {
    const page = await db.managed_events.page(conditions, limit, resumeFrom);
    return {
      rows: page.rows,
      nextCursor: encodeEventCursor(page.nextCursor, pageFingerprint),
    };
  }, 'INTERNAL_ERROR');
}

/**
 * Apply the shared 50/100 page limit, reporting the event code rather than the
 * access code that `parseLimit` throws.
 * @param {unknown} value
 * @returns {number}
 * @throws {AdminEventError} `INVALID_INPUT`
 */
function parseLimitOrInvalid(value) {
  try {
    return parseLimit(value);
  } catch {
    throw new AdminEventError('INVALID_INPUT');
  }
}
