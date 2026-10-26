/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminTenantAccessError, withTenantAccessErrors } from './errors.js';
import { selectSessionTenant } from './session.js';

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
 * List what the caller may select for normal work: one entry per active,
 * ready membership in an active, provisioned, RBAC-ready tenant
 * (M0001-09-R001, I0012-R008). A login that is two parties in one tenant
 * gets two entries.
 *
 * Unpaginated: bounded by one portal user's own memberships, and the PRD's
 * API table does not ask for cursor pagination on this route.
 * @param {{portal_user_tenants: import('../models/portal_user_tenants.js').PortalUserTenants, tenants: import('../models/tenants.js').Tenants}} db
 * @param {string} actorId The real operator — the caller's own memberships, never another user's.
 * @returns {Promise<{membershipId: string, tenant: object, memberType: string|null, label: string|null}[]>}
 *   Ordered by tenant name, then label.
 * @throws {AdminTenantAccessError} `CONFLICT`, `INTERNAL_ERROR`
 */
export async function listEligibleTenants(db, actorId) {
  return withTenantAccessErrors(async () => {
    const memberships = await db.portal_user_tenants.findWhere(
      { portal_user_id: actorId, status: 'active', ready: true },
      'AND',
      { columnWhitelist: ['id', 'tenant_id', 'member_type', 'member_label'] }
    );
    if (!memberships.length) return [];
    const tenants = await db.tenants.findWhere(
      {
        id: { $in: [...new Set(memberships.map(m => m.tenant_id))] },
        status: 'active',
        provisioned: true,
        rbac_ready: true,
      },
      'AND',
      { columnWhitelist: ['id', 'tenant_code', 'name', 'tier'] }
    );
    const byId = new Map(tenants.map(row => [row.id, row]));
    return memberships
      .filter(m => byId.has(m.tenant_id))
      .map(m => ({
        membershipId: m.id,
        tenant: eligibleTenantView(byId.get(m.tenant_id)),
        memberType: m.member_type,
        label: m.member_label,
      }))
      .sort(
        (a, b) =>
          a.tenant.name.localeCompare(b.tenant.name) ||
          (a.label ?? '').localeCompare(b.label ?? '')
      );
  });
}

const selectBodySchema = z.strictObject({ membership: z.uuid() });

/**
 * Select a membership, and so its tenant, for normal work (I0012-R009).
 *
 * M0001-09-R001, M0001-09-R002, M0001-09-R006. Every eligibility check runs
 * before `selectSessionTenant` performs the write, so a failed selection
 * never touches the session (R002) — no audit event is recorded on failure
 * either, mirroring `rotateSession`'s own precedent. The caller never supplies a cell or
 * database (R006): the request body only ever carries a membership UUID, and
 * the assigned cell is resolved here from the tenant record.
 * @param {object} db Admin database handle (tenants, portal_user_tenants, cells, sessions, ...).
 * @param {unknown} policy Session policy.
 * @param {unknown} token Current session token.
 * @param {object} session Caller's already-resolved session view.
 * @param {unknown} body `{ membership }`.
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
    const parsed = selectBodySchema.safeParse(body);
    if (!parsed.success) throw new AdminTenantAccessError('INVALID_INPUT');

    // I0012-R009: only the caller's own active, ready membership; another
    // login's membership is refused like a missing one.
    const membership = await db.portal_user_tenants.findOneBy(
      {
        id: parsed.data.membership,
        portal_user_id: session.user,
        status: 'active',
        ready: true,
      },
      { columnWhitelist: ['id', 'tenant_id'] }
    );
    if (!membership) throw new AdminTenantAccessError('FORBIDDEN');
    const tenantId = membership.tenant_id;

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

    return selectSessionTenant(db, policy, token, {
      tenantId,
      membershipId: membership.id,
      requestId,
    });
  });
}
