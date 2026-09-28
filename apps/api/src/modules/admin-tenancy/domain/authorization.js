/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The admin data scope an I0005 decision grants. Admin-tenancy routes act on
 * records Napsoft manages about tenants, so they require a `NAP` capability
 * (I0005-R003); a permit reaches every tenant's records and a deny reaches
 * none.
 * @param {{decision: 'permit'|'deny'}|undefined} authorization An `authorize` result.
 * @returns {import('./scope.js').AdminAccessScope}
 */
export function accessScope(authorization) {
  const granted = authorization?.decision === 'permit';
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
