/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminTenantAccessError, withTenantAccessErrors } from './errors.js';
import { accessScope } from './authorization.js';
import {
  selectSessionTenant,
  enterSessionSupport,
  exitSessionSupport,
} from './session.js';

/**
 * Business codes recorded on a `support.denied` event — see
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md
 * §4 and R003. Kept to exactly these two: every other support-entry failure
 * is an input or state problem, not an authorization denial, and is
 * recorded on `support.entered` (`outcome: 'failed'`) instead.
 */
export const SUPPORT_DENIAL_CODES = Object.freeze({
  capability: 'capability',
  napsoft: 'napsoft',
});

/** Business codes worth a `support.entered`/`failed` event: everything that
 * fails after the capability and Napsoft checks have already passed. */
const AUDITED_ENTER_FAILURE_CODES = new Set([
  'INVALID_INPUT',
  'NOT_FOUND',
  'FORBIDDEN',
  'CONFLICT',
]);

/**
 * Narrow safe view of a tenant a caller may select: deliberately smaller
 * than `tenantView()` (`domain/tenants.js`). An ordinary portal user's own
 * tenant picker has no business use for `cellId` or other internal fields.
 * @param {object} row
 * @returns {{id: string, code: string, name: string, tier: string}}
 */
export function eligibleTenantView(row) {
  return {
    id: row.id,
    code: row.tenant_code,
    name: row.name,
    tier: row.tier,
  };
}

/**
 * Turn a resolved authorization context into the minimal authority
 * `enterSupport` needs, mirroring `buildControlAuthority`
 * (`domain/cells.js`): whether `admin-tenancy::access::support` is granted,
 * and which tenants — Napsoft, once M0001-05 delivers role resolution — are
 * carved out of that grant.
 * @param {{actorId: string, platformCapabilities: string[]}} context Result of `resolveAuthorization`.
 * @returns {{actorId: string, granted: boolean, deniedTenantIds: string[]}}
 */
export function buildAccessAuthority(context) {
  const scope = accessScope(context, 'admin-tenancy::access::support');
  return {
    actorId: context.actorId,
    granted: scope.tenantIds === '*',
    deniedTenantIds: scope.deniedTenantIds,
  };
}

/**
 * List the tenants the caller may select for normal work: their own
 * active, ready memberships, joined to active, provisioned, RBAC-ready
 * tenants (M0001-09-R001).
 *
 * Unpaginated: bounded by one portal user's own memberships, and the PRD's
 * API table does not ask for cursor pagination on this route.
 * @param {{portal_user_tenants: import('../models/portal_user_tenants.js').PortalUserTenants, tenants: import('../models/tenants.js').Tenants}} db
 * @param {string} actorId The real operator — the caller's own memberships, never another user's.
 * @returns {Promise<object[]>} Safe tenant views (`eligibleTenantView`).
 * @throws {AdminTenantAccessError} `CONFLICT`, `INTERNAL_ERROR`
 */
export async function listEligibleTenants(db, actorId) {
  return withTenantAccessErrors(async () => {
    const memberships = await db.portal_user_tenants.findWhere(
      { portal_user_id: actorId, status: 'active', ready: true },
      'AND',
      { columnWhitelist: ['tenant_id'] }
    );
    if (!memberships.length) return [];
    const tenants = await db.tenants.findWhere(
      {
        id: { $in: memberships.map(m => m.tenant_id) },
        status: 'active',
        provisioned: true,
        rbac_ready: true,
      },
      'AND',
      { columnWhitelist: ['id', 'tenant_code', 'name', 'tier'] }
    );
    return tenants.map(eligibleTenantView);
  });
}

const selectBodySchema = z.strictObject({ tenant: z.uuid() });

/**
 * Select a tenant for normal work.
 *
 * M0001-09-R001, M0001-09-R002, M0001-09-R006. Every eligibility check runs
 * before `selectSessionTenant` performs the write, so a failed selection
 * never touches the session (R002) — no audit event is recorded on failure
 * either, mirroring `rotateSession`'s own precedent; §12 only mandates
 * audit retention for the support path. The caller never supplies a cell or
 * database (R006): the request body only ever carries a tenant UUID, and
 * the assigned cell is resolved here from the tenant record.
 * @param {object} db Admin database handle (tenants, portal_user_tenants, cells, sessions, ...).
 * @param {unknown} policy Session policy.
 * @param {unknown} token Current session token.
 * @param {object} session Caller's already-resolved session view.
 * @param {unknown} body `{ tenant }`.
 * @param {{requestId?: string|null, runtime?: {readiness: (cellId: string) => Promise<{ready: boolean}>|{ready: boolean}}}} [options]
 *   `runtime` is the same optional collaborator `getCellReadiness`
 *   (`domain/cells.js`) accepts; no runtime cell registry exists yet, so a
 *   caller that omits it always gets `CELL_UNAVAILABLE`.
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminTenantAccessError} `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`, `CELL_UNAVAILABLE`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function selectTenant(
  db,
  policy,
  token,
  session,
  body,
  { requestId = null, runtime } = {}
) {
  return withTenantAccessErrors(async () => {
    if (session.accessMode === 'support')
      throw new AdminTenantAccessError('CONFLICT');

    const parsed = selectBodySchema.safeParse(body);
    if (!parsed.success) throw new AdminTenantAccessError('INVALID_INPUT');
    const tenantId = parsed.data.tenant;

    const membership = await db.portal_user_tenants.findOneBy(
      {
        portal_user_id: session.user,
        tenant_id: tenantId,
        status: 'active',
        ready: true,
      },
      { columnWhitelist: ['id'] }
    );
    if (!membership) throw new AdminTenantAccessError('FORBIDDEN');

    const tenant = await db.tenants.findOneBy(
      { id: tenantId, status: 'active', provisioned: true, rbac_ready: true },
      { columnWhitelist: ['id', 'cell_id'] }
    );
    if (!tenant) throw new AdminTenantAccessError('FORBIDDEN');

    if (!tenant.cell_id) throw new AdminTenantAccessError('CELL_UNAVAILABLE');
    const cell = await db.cells.findOneBy(
      { id: tenant.cell_id, enabled: true },
      { columnWhitelist: ['id'] }
    );
    if (!cell) throw new AdminTenantAccessError('CELL_UNAVAILABLE');
    const readiness = runtime
      ? await runtime.readiness(tenant.cell_id)
      : { ready: false, checked: false };
    if (!readiness.ready) throw new AdminTenantAccessError('CELL_UNAVAILABLE');

    return selectSessionTenant(db, policy, token, { tenantId, requestId });
  });
}

const supportBodySchema = z.strictObject({
  tenant: z.uuid(),
  reason: z
    .string()
    .transform(value => value.trim())
    .refine(value => value.length >= 10 && value.length <= 512),
  effectiveUser: z.uuid().optional(),
});

/**
 * Append one `support.denied` event, target the caller's own session.
 * @param {object} db
 * @param {string} code A value of `SUPPORT_DENIAL_CODES`.
 * @param {object} session Caller's already-resolved session view.
 * @param {string|null} requestId
 * @returns {Promise<void>}
 */
async function appendSupportDenied(db, code, session, requestId) {
  await db.managed_events.append({
    deduplication_key: randomUUID(),
    target_type: 'session',
    event_key: 'support.denied',
    outcome: 'denied',
    request_id: requestId,
    actor_id: session.user,
    target_id: session.id,
    session_id: session.id,
    details: { code },
  });
}

/**
 * Append one `support.entered`/`failed` event for a failure that is not an
 * authorization denial (bad input, missing/ineligible record, or an
 * already-support-mode conflict).
 * @param {object} db
 * @param {object} session Caller's already-resolved session view.
 * @param {string|null} requestId
 * @returns {Promise<void>}
 */
async function appendSupportEntryFailure(db, session, requestId) {
  await db.managed_events.append({
    deduplication_key: randomUUID(),
    target_type: 'session',
    event_key: 'support.entered',
    outcome: 'failed',
    request_id: requestId,
    actor_id: session.user,
    target_id: session.id,
    session_id: session.id,
    details: {},
  });
}

/**
 * Enter a time-limited, attributed support context.
 *
 * M0001-09-R003, M0001-09-R004. Capability and the Napsoft restriction are
 * checked first and, on denial, recorded as `support.denied` with a stable
 * `code` (`SUPPORT_DENIAL_CODES`) — "deny without returning tenant data"
 * (§4 Actors table): a missing tenant and a Napsoft-denied one report the
 * same `NOT_FOUND`, so a caller cannot tell them apart. Every other failure
 * (bad input, an ineligible effective user, an already-support-mode
 * conflict) is recorded as `support.entered`/`failed` instead — it is an
 * input or state problem, not an authorization decision about the actor.
 * @param {object} db Admin database handle.
 * @param {unknown} policy Session policy.
 * @param {unknown} token Current session token.
 * @param {object} session Caller's already-resolved session view.
 * @param {{actorId: string, platformCapabilities: string[]}} context Result of `resolveAuthorization`.
 * @param {unknown} body `{ tenant, reason, effectiveUser? }`.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminTenantAccessError} `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function enterSupport(
  db,
  policy,
  token,
  session,
  context,
  body,
  { requestId = null } = {}
) {
  let deniedCode = null;
  try {
    return await withTenantAccessErrors(async () => {
      if (session.accessMode === 'support')
        throw new AdminTenantAccessError('CONFLICT');

      const authority = buildAccessAuthority(context);
      if (!authority.granted) {
        deniedCode = SUPPORT_DENIAL_CODES.capability;
        throw new AdminTenantAccessError('FORBIDDEN');
      }

      const parsed = supportBodySchema.safeParse(body);
      if (!parsed.success) throw new AdminTenantAccessError('INVALID_INPUT');
      const { tenant: tenantId, reason, effectiveUser } = parsed.data;

      const tenant = await db.tenants.findOneBy(
        { id: tenantId, status: 'active', rbac_ready: true },
        { columnWhitelist: ['id'] }
      );
      if (!tenant) throw new AdminTenantAccessError('NOT_FOUND');
      if (authority.deniedTenantIds.includes(tenantId)) {
        deniedCode = SUPPORT_DENIAL_CODES.napsoft;
        throw new AdminTenantAccessError('NOT_FOUND');
      }

      let effectiveUserId = null;
      if (effectiveUser !== undefined) {
        const user = await db.portal_users.findOneBy(
          { id: effectiveUser, status: 'active' },
          { columnWhitelist: ['id'] }
        );
        if (!user) throw new AdminTenantAccessError('NOT_FOUND');
        const membership = await db.portal_user_tenants.findOneBy(
          {
            portal_user_id: effectiveUser,
            tenant_id: tenantId,
            status: 'active',
            ready: true,
          },
          { columnWhitelist: ['id'] }
        );
        if (!membership) throw new AdminTenantAccessError('FORBIDDEN');
        effectiveUserId = effectiveUser;
      }

      return enterSessionSupport(db, policy, token, {
        tenantId,
        effectiveUserId,
        reason,
        requestId,
      });
    });
  } catch (error) {
    if (deniedCode)
      await appendSupportDenied(db, deniedCode, session, requestId);
    else if (AUDITED_ENTER_FAILURE_CODES.has(error?.code))
      await appendSupportEntryFailure(db, session, requestId);
    throw error;
  }
}

/**
 * Exit a support context.
 *
 * M0001-09-R005. The pre-exit `tenant`/`effectiveUser` come from the
 * already-resolved `session` view, since the session row has already
 * cleared them by the time `exitSessionSupport` records its event.
 * @param {object} db Admin database handle.
 * @param {unknown} policy Session policy.
 * @param {unknown} token Current session token.
 * @param {object} session Caller's already-resolved session view.
 * @param {{requestId?: string|null}} [options]
 * @returns {Promise<{token: string, session: object}>}
 * @throws {AdminTenantAccessError} `UNAUTHENTICATED`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function exitSupport(
  db,
  policy,
  token,
  session,
  { requestId = null } = {}
) {
  return withTenantAccessErrors(async () => {
    if (session.accessMode !== 'support')
      throw new AdminTenantAccessError('CONFLICT');
    return exitSessionSupport(db, policy, token, {
      tenantId: session.tenant,
      effectiveUserId: session.effectiveUser,
      requestId,
    });
  });
}
