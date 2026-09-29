/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { covers } from '../../access-control/domain/patterns.js';

/**
 * The admin data scope an I0005 decision grants. Admin-tenancy routes act on
 * records Napsoft manages about tenants, so they require a `NAP` capability
 * (I0005-R003); a Napsoft permit reaches every tenant's records, a
 * customer-tenant permit only that tenant's, and a deny none.
 * @param {{decision: 'permit'|'deny'}|undefined} authorization An `authorize` result.
 * @returns {import('./scope.js').AdminAccessScope}
 */
export function accessScope(authorization) {
  const granted = authorization?.decision === 'permit';
  // A permit against a customer tenant (`orTenantParam`) reaches only that
  // tenant's records.
  const target = authorization?.targetTenant;
  if (granted && target && !target.is_napsoft)
    return {
      platformPortalUserRead: false,
      tenantIds: [target.id],
      archiveManagement: false,
    };
  return {
    platformPortalUserRead: granted,
    tenantIds: granted ? '*' : [],
    archiveManagement: granted,
  };
}

/**
 * The `{actorId, scope}` authority the accounts and entitlement domains take,
 * from a request `requireCapability` permitted.
 * @param {import('express').Request} request
 * @returns {{actorId: string, scope: import('./scope.js').AdminAccessScope}}
 */
export function requestAuthority(request) {
  return {
    actorId: request.authorization.actorId,
    scope: accessScope(request.authorization),
  };
}

const EVENTS_READ = 'admin-tenancy::events::read';

/**
 * The event-reader scope for a caller's resolved patterns (M0001-12-R004, §7
 * reader table):
 * - covering `NAP::admin-tenancy::events::read` reads every event, including
 *   events with no tenant;
 * - covering `*::admin-tenancy::events::read` reads every tenant's events
 *   except the Napsoft tenant's, and no null-tenant events;
 * - otherwise, a pattern naming a tenant code reads only that tenant's
 *   events.
 * Fail-closed: no covering pattern reads nothing.
 * @param {{tenants: {findWhere: Function}}} db Admin repository handle.
 * @param {{patterns: string[], napsoftCode: string|null}} caller An `authorize` result, or the same fields.
 * @param {{id: string}|null} napsoft The Napsoft tenant.
 * @returns {Promise<import('./scope.js').AdminAccessScope>}
 */
export async function eventReaderScope(db, { patterns, napsoftCode }, napsoft) {
  const closed = {
    platformPortalUserRead: false,
    tenantIds: [],
    archiveManagement: false,
  };
  const options = { napsoftCode };
  const holds = tenant =>
    patterns.some(own => covers(own, `${tenant}::${EVENTS_READ}`, options));
  if (napsoftCode && holds(napsoftCode)) return { ...closed, tenantIds: '*' };
  if (holds('*'))
    return {
      ...closed,
      tenantIds: '*',
      excludeTenantIds: napsoft ? [napsoft.id] : [],
    };
  const codes = [
    ...new Set(
      patterns
        .map(pattern => pattern.split('::')[0])
        .filter(code => code !== '*' && code !== napsoftCode && holds(code))
    ),
  ];
  if (!codes.length) return closed;
  const tenants = await db.tenants.findWhere(
    { tenant_code: { $in: codes } },
    'AND',
    { columnWhitelist: ['id'] }
  );
  return { ...closed, tenantIds: tenants.map(row => row.id) };
}
