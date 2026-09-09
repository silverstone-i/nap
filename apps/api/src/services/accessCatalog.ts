/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { z } from 'zod';
import type { resourceCatalogSchema } from '@nap/shared';
/** Does: Lists shipped business resource permissions. Used by: seeds, route assertions and administration. */
export const accessCatalog: z.infer<typeof resourceCatalogSchema> = [
  {
    resource: 'core::companies',
    label: 'Companies',
    scopes: ['companies', 'all_companies', 'tenant'],
    capabilities: ['list', 'read', 'create', 'update', 'archive'].map(
      action => `core::companies::${action}`
    ),
    fields: [],
  },
  {
    resource: 'projects::projects',
    label: 'Projects',
    scopes: ['projects', 'all_projects', 'company_projects', 'tenant'],
    capabilities: [
      'list',
      'read',
      'create',
      'update',
      'archive',
      'company-options',
    ].map(action => `projects::projects::${action}`),
    fields: [],
  },
];
/** Does: Names access-administration operations. Used by: permanent tenant-admin resolution. */
export const accessPermissions = [
  'core::access::overview',
  'core::access::change',
  'core::access::effective',
];
/** Does: Names every shipped tenant capability. Used by: administrator roles and validation. */
export const businessPermissions = [
  'core::identity::profile',
  ...accessPermissions,
  ...accessCatalog.flatMap(r => r.capabilities),
];
