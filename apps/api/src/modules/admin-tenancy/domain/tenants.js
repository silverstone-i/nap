/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminTenantError, withTenantErrors } from './errors.js';
import { COLLECTION_ENTITY } from './cache.js';

/** Advisory lock key serializing concurrent tenant creation. */
const LOCK_KEY = "hashtext('admin-tenancy:tenant-registry')";

/** Tiers a tenant may be created with, matching `admin.tenants`' check constraint. */
export const TIERS = Object.freeze(['starter', 'growth', 'enterprise']);

/** Business codes §12 requires an event for. Anything else (an unavailable
 * event store, or a genuinely unexpected failure) must not trigger a second,
 * likely-also-failing append. */
const AUDITED_FAILURE_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
]);

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  granted: z.boolean(),
  deniedTenantIds: z.array(z.uuid()),
});

/**
 * Require write authority. A create has no existing target tenant, so
 * (unlike retry or disable in domain/cells.js) `deniedTenantIds` is never
 * consulted here — support's Napsoft restriction on this route comes
 * entirely from `is_napsoft` never being an acceptable request field.
 * @param {unknown} authority Result of `buildControlAuthority` (domain/cells.js).
 * @returns {{actorId: string}}
 * @throws {AdminTenantError} `INVALID_INPUT`, `FORBIDDEN`
 */
function requireGranted(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminTenantError('INVALID_INPUT');
  if (!result.data.granted) throw new AdminTenantError('FORBIDDEN');
  return result.data;
}

/** Safe projection of `admin.tenants`, in the API's literal camelCase contract (§10). */
export function tenantView(row) {
  return {
    id: row.id,
    code: row.tenant_code,
    name: row.name,
    tier: row.tier,
    status: row.status,
    cellId: row.cell_id,
    provisioned: row.provisioned,
    rbacReady: row.rbac_ready,
  };
}

/**
 * @typedef {object} AdminTenantsDb
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {import('../models/cache_revisions.js').CacheRevisions} cache_revisions
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

const bodySchema = z.strictObject({
  code: z.string(),
  name: z.string(),
  tier: z.enum(TIERS),
});

const codeSchema = z
  .string()
  .transform(value => value.trim().toUpperCase())
  .refine(value => /^[A-Z][A-Z0-9_]{1,31}$/.test(value));

const nameSchema = z
  .string()
  .transform(value => value.trim())
  .refine(value => value.length >= 1 && value.length <= 160);

/**
 * Validate and normalize a tenant-creation request body.
 *
 * A `strictObject` is what makes `is_napsoft` (or any other extra field)
 * unsettable through this route for every actor, including root: only
 * `db:bootstrap` (M0001-02) ever creates a tenant with `is_napsoft = true`.
 * @param {unknown} body
 * @returns {{code: string, name: string, tier: 'starter'|'growth'|'enterprise'}}
 * @throws {AdminTenantError} `INVALID_INPUT`
 */
export function parseCreateTenantInput(body) {
  const result = bodySchema.safeParse(body);
  if (!result.success) throw new AdminTenantError('INVALID_INPUT');
  const code = codeSchema.safeParse(result.data.code);
  const name = nameSchema.safeParse(result.data.name);
  if (!code.success || !name.success)
    throw new AdminTenantError('INVALID_INPUT');
  return { code: code.data, name: name.data, tier: result.data.tier };
}

const idempotencyKeySchema = z.uuid();

/**
 * Validate the required `Idempotency-Key` header.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminTenantError} `INVALID_INPUT`
 */
export function parseIdempotencyKey(value) {
  const result = idempotencyKeySchema.safeParse(value);
  if (!result.success) throw new AdminTenantError('INVALID_INPUT');
  return result.data;
}

/**
 * Whether a stored event's request snapshot matches a normalized request.
 * @param {{tenant_code: string, name: string, tier: string}} snapshot
 * @param {{code: string, name: string, tier: string}} normalized
 * @returns {boolean}
 */
function snapshotMatches(snapshot, normalized) {
  return (
    snapshot.tenant_code === normalized.code &&
    snapshot.name === normalized.name &&
    snapshot.tier === normalized.tier
  );
}

/**
 * Resolve a previously recorded `tenant.created` success for this
 * idempotency key against the current request.
 *
 * Both the comparison and the returned view come entirely from the event's
 * immutable `details` snapshot and this Work Unit's fixed creation-time
 * constants — never a fresh read of the live `tenants` row — so a later
 * edit to the tenant (a future Work Unit) cannot change what an old
 * idempotent replay returns.
 * @param {AdminTenantsDb} db
 * @param {string} idempotencyKey
 * @param {{code: string, name: string, tier: string}} normalized
 * @returns {Promise<object|null>} The original tenant's safe view, or `null`
 *   when no prior success is recorded for this key.
 * @throws {AdminTenantError} `IDEMPOTENCY_CONFLICT`
 */
async function resolveIdempotentReplay(db, idempotencyKey, normalized) {
  const existing = await db.managed_events.findOneBy({
    deduplication_key: idempotencyKey,
    event_key: 'tenant.created',
    outcome: 'succeeded',
  });
  if (!existing) return null;
  if (!snapshotMatches(existing.details, normalized))
    throw new AdminTenantError('IDEMPOTENCY_CONFLICT');
  return {
    id: existing.target_id,
    code: existing.details.tenant_code,
    name: existing.details.name,
    tier: existing.details.tier,
    status: 'pending',
    cellId: null,
    provisioned: false,
    rbacReady: false,
  };
}

/**
 * Append a denied or failed tenant-creation event, minting a fresh
 * deduplication key. Never reuses the client's `Idempotency-Key`: only a
 * recorded success claims it, so a corrected retry with the same key can
 * still succeed.
 * @param {AdminTenantsDb} db
 * @param {'denied'|'failed'} outcome
 * @param {{requestId: string|null, actorId: string|null}} attribution
 * @returns {Promise<void>}
 */
async function appendFailureEvent(db, outcome, { requestId, actorId }) {
  await db.managed_events.append({
    deduplication_key: randomUUID(),
    target_type: 'tenant',
    event_key: 'tenant.created',
    outcome,
    request_id: requestId,
    actor_id: actorId,
  });
}

/**
 * Create a central tenant. No cell assignment, provisioning, or RBAC
 * readiness is claimed.
 *
 * M0001-07-R001 through M0001-07-R005. Serializes all creation attempts
 * behind one advisory lock, mirroring `registerCell` (domain/cells.js): the
 * lock makes the idempotency-key lookup and the code-uniqueness check
 * race-free without any `ON CONFLICT` handling.
 * @param {AdminTenantsDb} db
 * @param {unknown} authority Result of `buildControlAuthority` (domain/cells.js) for `admin-tenancy::control::write`.
 * @param {unknown} body `{ code, name, tier }`
 * @param {unknown} idempotencyKeyHeader The raw `Idempotency-Key` header value.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<object>} Safe tenant view.
 * @throws {AdminTenantError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function createTenant(
  db,
  authority,
  body,
  idempotencyKeyHeader,
  { requestId = null } = {}
) {
  // Captured before `requireGranted` so a denial's event still attributes
  // the real actor, not `null` — the throw happens before an assignment
  // inside the `try` block below would run.
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  try {
    // `withTenantErrors` wraps only the core logic, translating a raw
    // database or collaborator error (a serialization/deadlock SQLSTATE, an
    // unavailable cache-revision store) into its final `AdminTenantError`
    // code before this function's own `catch` decides whether to record a
    // failure event. Deciding on the pre-translation error would miss the
    // required event for a conflict that only becomes `CONFLICT` after
    // translation.
    return await withTenantErrors(async () => {
      const granted = requireGranted(authority);
      actorId = granted.actorId;
      const idempotencyKey = parseIdempotencyKey(idempotencyKeyHeader);
      const normalized = parseCreateTenantInput(body);

      const replay = await resolveIdempotentReplay(
        db,
        idempotencyKey,
        normalized
      );
      if (replay) return replay;

      return await db.tx(async tx => {
        await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
        const racedReplay = await resolveIdempotentReplay(
          db,
          idempotencyKey,
          normalized
        );
        if (racedReplay) return racedReplay;
        const existingCode = await db.tenants.lockActiveByCode(
          normalized.code,
          { tx }
        );
        if (existingCode) throw new AdminTenantError('CONFLICT');
        const tenant = await db.tenants.insert(
          {
            tenant_code: normalized.code,
            name: normalized.name,
            tier: normalized.tier,
            status: 'pending',
            cell_id: null,
            provisioned: false,
            rbac_ready: false,
            revision: 1,
            is_napsoft: false,
          },
          { tx }
        );
        await db.managed_events.append(
          {
            deduplication_key: idempotencyKey,
            target_type: 'tenant',
            event_key: 'tenant.created',
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: granted.actorId,
            tenant_id: tenant.id,
            target_id: tenant.id,
            details: {
              tenant_code: tenant.tenant_code,
              name: tenant.name,
              tier: tenant.tier,
            },
          },
          { tx }
        );
        await db.cache_revisions.advance(
          [{ domain: 'tenant', entity: COLLECTION_ENTITY }],
          { tx }
        );
        return tenantView(tenant);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId }
      );
    throw error;
  }
}
