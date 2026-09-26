/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminEntitlementError, withEntitlementErrors } from './errors.js';
import { parseScope, isTenantPermitted } from './scope.js';
import { parseUuid } from './validation.js';

/**
 * Optional modules a tenant may be entitled to, matching M0001-10 §6. No
 * module descriptor registry exists yet to derive this from — each module
 * descriptor only carries a 3-value `entitlementType`
 * (`foundation`/`optional`/`infrastructure`), not a catalogue of module
 * names — so this is a local constant, the same way `tenants.js` defines
 * `TIERS` and `accounts.js` defines `MEMBER_TYPES`.
 */
export const OPTIONAL_MODULES = Object.freeze([
  'business-directory',
  'companies',
  'catalog',
  'projects',
  'cost-codes',
  'estimating',
  'scheduling',
  'project-costs',
  'sales',
  'contracts',
  'accounting',
  'accounts-payable',
  'accounts-receivable',
]);

const OPTIONAL_MODULE_SET = new Set(OPTIONAL_MODULES);

/**
 * Business codes worth a recorded event when a mutation fails or is denied
 * before completing. Includes `SERVICE_UNAVAILABLE` (an unavailable
 * `cache_revisions` store) unlike `tenants.js`/`accounts.js`'s equivalent
 * sets: `appendFailureEvent` writes to `managed_events`, an independent
 * table/subsystem the cache-revision store being down says nothing about,
 * so — unlike an unavailable *event* store, which would make a second
 * append attempt likely-also-failing — this append isn't expected to fail
 * for the same reason the mutation did.
 */
const AUDITED_FAILURE_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'SERVICE_UNAVAILABLE',
]);

/**
 * @typedef {object} AdminEntitlementsDb
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/module_entitlements.js').ModuleEntitlements} module_entitlements
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {import('../models/cache_revisions.js').CacheRevisions} cache_revisions
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

/**
 * Safe projection of one module's entitlement state. A `row` of `null`
 * represents an absent row — disabled, revision `0` — mirroring
 * `CacheRevisions.current`'s "missing rows have revision 0 and are not
 * inserted."
 * @param {string} module
 * @param {{enabled: boolean, revision: number}|null} row
 * @returns {{module: string, enabled: boolean, revision: number}}
 */
export function entitlementView(module, row) {
  return {
    module,
    enabled: row ? row.enabled : false,
    revision: row ? row.revision : 0,
  };
}

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  scope: z.unknown(),
});

/**
 * Validate an entitlement authority: the real operator, and the
 * `admin-tenancy::entitlements::read`/`::write` scope built for this request.
 * @param {unknown} authority
 * @returns {{actorId: string, scope: import('./scope.js').AdminAccessScope}}
 * @throws {AdminEntitlementError} `INVALID_INPUT`
 */
function requireAuthority(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminEntitlementError('INVALID_INPUT');
  let scope;
  try {
    scope = parseScope(result.data.scope);
  } catch {
    throw new AdminEntitlementError('INVALID_INPUT');
  }
  return { actorId: result.data.actorId, scope };
}

/**
 * Require that `scope` may act on `tenantId`.
 *
 * Unlike `accounts.js`'s `requireTenantAuthority`, a tenant the scope does
 * not name at all and a tenant explicitly carved out of a granted scope
 * (support's Napsoft restriction) report the same code: M0001-10 §10 states
 * "unauthorized or Napsoft support targets return 403," so both collapse to
 * `FORBIDDEN` here rather than splitting into `FORBIDDEN`/`NOT_FOUND`.
 * @param {import('./scope.js').AdminAccessScope} scope
 * @param {string} tenantId
 * @returns {void}
 * @throws {AdminEntitlementError} `FORBIDDEN`
 */
function requireEntitlementAuthority(scope, tenantId) {
  if (!isTenantPermitted(scope, tenantId))
    throw new AdminEntitlementError('FORBIDDEN');
}

/**
 * Validate a tenant-id path argument.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminEntitlementError} `INVALID_INPUT`
 */
function parseTenantIdParam(value) {
  try {
    return parseUuid(value);
  } catch {
    throw new AdminEntitlementError('INVALID_INPUT');
  }
}

const moduleFormatSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9-]*$/);

/**
 * Validate a module path argument: well-formed and present in the optional
 * catalogue. A well-formed name absent from the catalogue — including every
 * mandatory/infrastructure module name — is `NOT_FOUND`, matching M0001-10
 * §4 ("Any actor / Unknown module / Reject") and §10 ("Unknown ... modules
 * return 404").
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminEntitlementError} `INVALID_INPUT`, `NOT_FOUND`
 */
function parseModuleParam(value) {
  const result = moduleFormatSchema.safeParse(value);
  if (!result.success) throw new AdminEntitlementError('INVALID_INPUT');
  if (!OPTIONAL_MODULE_SET.has(result.data))
    throw new AdminEntitlementError('NOT_FOUND');
  return result.data;
}

/**
 * Require that `tenantId` names an existing, unarchived tenant (M0001-10-R005).
 * @param {AdminEntitlementsDb} db
 * @param {string} tenantId
 * @param {{tx?: object}} [options]
 * @returns {Promise<void>}
 * @throws {AdminEntitlementError} `NOT_FOUND`
 */
async function requireExistingTenant(db, tenantId, { tx } = {}) {
  const tenant = await db.tenants.findOneBy(
    { id: tenantId },
    { tx, columnWhitelist: ['id', 'deactivated_at'] }
  );
  if (!tenant || tenant.deactivated_at)
    throw new AdminEntitlementError('NOT_FOUND');
}

/**
 * Append a denied or failed entitlement event, minting a fresh deduplication
 * key. Mirrors `domain/accounts.js`'s `appendFailureEvent`.
 * @param {AdminEntitlementsDb} db
 * @param {'entitlement.granted'|'entitlement.withdrawn'} eventKey
 * @param {'denied'|'failed'} outcome
 * @param {{requestId: string|null, actorId: string|null, tenantId: string|null, module: string|null}} attribution
 * @returns {Promise<void>}
 */
async function appendFailureEvent(
  db,
  eventKey,
  outcome,
  { requestId, actorId, tenantId, module }
) {
  await db.managed_events.append({
    deduplication_key: randomUUID(),
    target_type: 'entitlement',
    event_key: eventKey,
    outcome,
    request_id: requestId,
    actor_id: actorId,
    tenant_id: tenantId,
    details: module ? { module_key: module } : {},
  });
}

/**
 * Read the effective state of every optional module for a tenant.
 *
 * M0001-10-R002. No audit event: a read is never recorded, mirroring
 * `domain/accounts.js`'s `getUser`/`getJob`.
 * @param {AdminEntitlementsDb} db
 * @param {unknown} authority `{actorId, scope}`; `scope` built for `admin-tenancy::entitlements::read`.
 * @param {unknown} tenantId
 * @returns {Promise<{module: string, enabled: boolean, revision: number}[]>}
 * @throws {AdminEntitlementError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
 */
export async function listEntitlements(db, authority, tenantId) {
  const { scope } = requireAuthority(authority);
  const id = parseTenantIdParam(tenantId);
  return withEntitlementErrors(async () => {
    requireEntitlementAuthority(scope, id);
    await requireExistingTenant(db, id);
    const rows = await db.module_entitlements.findWhere(
      { tenant_id: id },
      'AND',
      { columnWhitelist: ['module', 'enabled', 'revision'] }
    );
    const byModule = new Map(rows.map(row => [row.module, row]));
    return OPTIONAL_MODULES.map(module =>
      entitlementView(module, byModule.get(module) ?? null)
    );
  });
}

/**
 * Change one tenant's entitlement for one module: grant enables it, withdraw
 * disables it. Shared by `grantEntitlement`/`withdrawEntitlement`.
 *
 * M0001-10-R003, M0001-10-R005, M0001-10-R006. A per-`(tenant, module)`
 * advisory lock serializes concurrent changes (§7) even when no row exists
 * yet to lock with `FOR UPDATE` — unlike the *global* registry locks in
 * `tenants.js`/`accounts.js`/`cells.js`, this only needs to exclude other
 * writers of the same pair, since the table's `(tenant_id, module)`
 * uniqueness is already enforced by a real constraint. Every call — including
 * a no-op repeat — records a `managed_events` row carrying the module, the
 * prior and resulting `enabled` state, and the resulting `revision` (§12); a
 * cache-revision advance fires only when `enabled` actually changes.
 * @param {AdminEntitlementsDb} db
 * @param {unknown} authority `{actorId, scope}`; `scope` built for `admin-tenancy::entitlements::write`.
 * @param {unknown} tenantId
 * @param {unknown} moduleParam
 * @param {boolean} targetEnabled `true` for a grant, `false` for a withdrawal.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{module: string, enabled: boolean, revision: number}>}
 * @throws {AdminEntitlementError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
async function setEntitlement(
  db,
  authority,
  tenantId,
  moduleParam,
  targetEnabled,
  { requestId = null } = {}
) {
  const eventKey = targetEnabled
    ? 'entitlement.granted'
    : 'entitlement.withdrawn';
  let actorId =
    typeof authority?.actorId === 'string' ? authority.actorId : null;
  let id = null;
  let module = null;
  // Best-effort echo of the requested module for a failure event, captured
  // before validation so a rejected (unknown or malformed) module is still
  // named in the audit trail — mirroring `actorId`'s pre-validation capture
  // above. Truncated to `parseDetails`' 256-character string limit.
  const requestedModule =
    typeof moduleParam === 'string' && moduleParam.length > 0
      ? moduleParam.slice(0, 256)
      : null;
  try {
    return await withEntitlementErrors(async () => {
      const granted = requireAuthority(authority);
      actorId = granted.actorId;
      id = parseTenantIdParam(tenantId);
      requireEntitlementAuthority(granted.scope, id);
      module = parseModuleParam(moduleParam);

      return await db.tx(async tx => {
        // `hashtextextended` (64-bit) rather than `hashtext` (32-bit): unlike
        // every other advisory lock in this module, which hashes one of a
        // handful of fixed registry-name literals, this key is parameterized
        // per `(tenant, module)` pair across a potentially large key space,
        // so it needs the wider hash to keep collision risk negligible.
        await tx.one(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
          `admin-tenancy:entitlement:${id}:${module}`,
        ]);
        await requireExistingTenant(db, id, { tx });
        const row = await db.module_entitlements.findOneBy(
          { tenant_id: id, module },
          { tx }
        );

        if (!row) {
          if (!targetEnabled) {
            // "No unnecessary row for absence" (§8): an absent entitlement is
            // already withdrawn.
            await db.managed_events.append(
              {
                deduplication_key: randomUUID(),
                target_type: 'entitlement',
                event_key: eventKey,
                outcome: 'succeeded',
                request_id: requestId,
                actor_id: granted.actorId,
                tenant_id: id,
                target_id: null,
                details: {
                  module_key: module,
                  from_enabled: false,
                  to_enabled: false,
                  revision: 0,
                },
              },
              { tx }
            );
            return entitlementView(module, null);
          }
          const inserted = await db.module_entitlements.insert(
            { tenant_id: id, module, enabled: true, revision: 1 },
            { tx }
          );
          await db.managed_events.append(
            {
              deduplication_key: randomUUID(),
              target_type: 'entitlement',
              event_key: eventKey,
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: granted.actorId,
              tenant_id: id,
              target_id: inserted.id,
              details: {
                module_key: module,
                from_enabled: false,
                to_enabled: true,
                revision: inserted.revision,
              },
            },
            { tx }
          );
          await db.cache_revisions.advance(
            [{ domain: 'entitlement', entity: id }],
            {
              tx,
            }
          );
          return entitlementView(module, inserted);
        }

        if (row.enabled === targetEnabled) {
          await db.managed_events.append(
            {
              deduplication_key: randomUUID(),
              target_type: 'entitlement',
              event_key: eventKey,
              outcome: 'succeeded',
              request_id: requestId,
              actor_id: granted.actorId,
              tenant_id: id,
              target_id: row.id,
              details: {
                module_key: module,
                from_enabled: row.enabled,
                to_enabled: row.enabled,
                revision: row.revision,
              },
            },
            { tx }
          );
          return entitlementView(module, row);
        }

        const updated = await db.module_entitlements.update(
          row.id,
          { enabled: targetEnabled },
          { tx }
        );
        await db.managed_events.append(
          {
            deduplication_key: randomUUID(),
            target_type: 'entitlement',
            event_key: eventKey,
            outcome: 'succeeded',
            request_id: requestId,
            actor_id: granted.actorId,
            tenant_id: id,
            target_id: row.id,
            details: {
              module_key: module,
              from_enabled: row.enabled,
              to_enabled: targetEnabled,
              revision: updated.revision,
            },
          },
          { tx }
        );
        await db.cache_revisions.advance(
          [{ domain: 'entitlement', entity: id }],
          {
            tx,
          }
        );
        return entitlementView(module, updated);
      });
    });
  } catch (error) {
    if (AUDITED_FAILURE_CODES.has(error?.code))
      await appendFailureEvent(
        db,
        eventKey,
        error.code === 'FORBIDDEN' ? 'denied' : 'failed',
        { requestId, actorId, tenantId: id, module: module ?? requestedModule }
      );
    throw error;
  }
}

/**
 * Grant a tenant's use of an optional module.
 * @param {AdminEntitlementsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} tenantId
 * @param {unknown} moduleParam
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{module: string, enabled: boolean, revision: number}>}
 * @throws {AdminEntitlementError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export function grantEntitlement(
  db,
  authority,
  tenantId,
  moduleParam,
  options
) {
  return setEntitlement(db, authority, tenantId, moduleParam, true, options);
}

/**
 * Withdraw a tenant's use of an optional module.
 * @param {AdminEntitlementsDb} db
 * @param {unknown} authority `{actorId, scope}`.
 * @param {unknown} tenantId
 * @param {unknown} moduleParam
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{module: string, enabled: boolean, revision: number}>}
 * @throws {AdminEntitlementError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export function withdrawEntitlement(
  db,
  authority,
  tenantId,
  moduleParam,
  options
) {
  return setEntitlement(db, authority, tenantId, moduleParam, false, options);
}
