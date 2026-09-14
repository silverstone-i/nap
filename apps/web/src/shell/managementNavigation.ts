/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/** Does: Returns management destinations available under individual platform permissions. Called by: navigation and the legacy landing redirect. */
export function managementDestinations(permissions: readonly string[]) {
  const can = (action: string) =>
    permissions.includes(`admin-tenancy::control::${action}`);
  return [
    {
      label: 'Tenants',
      path: '/management/tenants',
      allowed: can('overview') || can('registry') || can('provision'),
    },
    {
      label: 'Cells',
      path: can('overview') ? '/management/cells' : '/management/cells/new',
      allowed: can('overview') || can('registry'),
    },
    {
      label: 'Portal users',
      path: '/management/portal-users',
      allowed: can('overview') || can('members'),
    },
    {
      label: 'Platform access',
      path: '/management/platform-access',
      allowed: can('access-overview'),
    },
    {
      label: 'Access',
      path: '/management/access',
      allowed: can('access') || can('impersonate'),
    },
    { label: 'Audit', path: '/management/audit', allowed: can('audit') },
  ].filter(item => item.allowed);
}
