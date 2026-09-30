/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Tenant Management` navigation group's data (I0001-R023).
 *
 * A child is visible only when it is implemented and the session's resolved
 * capabilities match its route capability (I0005-R011). Tenants, cells, and
 * portal users are records Napsoft manages, so they target the Napsoft
 * tenant. Roles belong to the selected tenant and live under `Settings`.
 */

import { can } from '../auth/capabilities.js';

export const TENANT_MANAGEMENT_CHILDREN = Object.freeze([
  Object.freeze({
    id: 'tenants',
    label: 'Tenants',
    path: '/management/tenants',
    implemented: true,
    capability: 'admin-tenancy::control::read',
    target: 'napsoft',
  }),
  Object.freeze({
    id: 'cells',
    label: 'Cells',
    path: '/management/cells',
    implemented: true,
    capability: 'admin-tenancy::control::read',
    target: 'napsoft',
  }),
  Object.freeze({
    id: 'portal-users',
    label: 'Portal Users',
    path: '/management/portal-users',
    implemented: true,
    capability: 'admin-tenancy::accounts::read',
    target: 'napsoft',
  }),
]);

/**
 * Whether one child should be visible: implemented *and* matched.
 * @param {{implemented: boolean, capability: string, target: 'session'|'napsoft'}} child
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {boolean}
 */
export function isChildVisible(child, capabilities) {
  return child.implemented && can(capabilities, child.capability, child.target);
}

/**
 * The `Tenant Management` children visible for the session's capabilities.
 * @param {object|null} capabilities `GET /session/capabilities` data.
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleTenantManagementChildren(capabilities) {
  return TENANT_MANAGEMENT_CHILDREN.filter(child =>
    isChildVisible(child, capabilities)
  ).map(({ id, label, path }) => ({ id, label, path }));
}
