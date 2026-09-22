/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The `Tenant Management` navigation group's data (F0001-R023).
 *
 * A child is visible only when both are true: its own `implemented` flag
 * (a real UI destination exists) and the server's per-destination
 * authorization signal, `entryPoints.tenantManagement` (F0001-R024) —
 * `{tenants, cells, portalUsers}`, each derived server-side from the
 * caller's actual resolved capabilities
 * (`apps/api/src/modules/admin-tenancy/apiRoutes/v1/access.js`). Neither
 * condition alone is sufficient (F0002-R010).
 *
 * Every child below is still `implemented: false`: F0001 §3 Scope
 * excludes entity-administration screens, and
 * [F0002](../../../../../docs/PRDs/features/F0002-platform-administration-screens.md)
 * (Draft), which defines them, has not been built yet. So
 * `visibleTenantManagementChildren` returns none today regardless of
 * `entryPoints`, which is what correctly keeps the whole group hidden
 * (F0001-R023, AC16's empty-group case). Flipping a child to
 * `implemented: true` is the only change F0002's implementation needs to
 * make here — the authorization gate below is already real.
 */

export const TENANT_MANAGEMENT_CHILDREN = Object.freeze([
  Object.freeze({
    id: 'tenants',
    label: 'Tenants',
    path: '/management/tenants',
    implemented: false,
    authKey: 'tenants',
  }),
  Object.freeze({
    id: 'cells',
    label: 'Cells',
    path: '/management/cells',
    implemented: false,
    authKey: 'cells',
  }),
  Object.freeze({
    id: 'portal-users',
    label: 'Portal Users',
    path: '/management/portal-users',
    implemented: false,
    authKey: 'portalUsers',
  }),
]);

/**
 * Whether one child should be visible: implemented *and* authorized.
 * Neither condition alone is sufficient (F0002-R010).
 * @param {{implemented: boolean, authKey: string}} child
 * @param {{tenantManagement?: {tenants?: boolean, cells?: boolean, portalUsers?: boolean}}|null} [entryPoints]
 * @returns {boolean}
 */
export function isChildVisible(child, entryPoints) {
  return Boolean(
    child.implemented && entryPoints?.tenantManagement?.[child.authKey]
  );
}

/**
 * The `Tenant Management` children visible for the caller's current
 * `entryPoints` (from the access context).
 * @param {{tenantManagement?: {tenants?: boolean, cells?: boolean, portalUsers?: boolean}}|null} [entryPoints]
 * @returns {Array<{id: string, label: string, path: string}>}
 */
export function visibleTenantManagementChildren(entryPoints) {
  return TENANT_MANAGEMENT_CHILDREN.filter(child =>
    isChildVisible(child, entryPoints)
  ).map(({ id, label, path }) => ({ id, label, path }));
}
