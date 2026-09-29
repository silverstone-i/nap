/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-business-directory.js';

/**
 * Module descriptor for `business-directory` (M0005). It registers the eight
 * `app` directory tables, the baseline migration, and its route
 * capabilities with the cell registry. It must follow `access-control` in
 * the registry, because its migration reuses `app.protect_record()`. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'business-directory',
  databaseTarget: 'cell',
  schema: 'app',
  // Every tenant has directory rows from provisioning (M0005-R022), so no
  // entitlement gates it.
  entitlementType: 'foundation',
  models: repositories,
  migrations: [migration],
  // M0005 §4 and §10.
  capabilities: [
    'business-directory::directory::read',
    'business-directory::directory::write',
    'business-directory::labels::write',
    'business-directory::tenant-contacts::write',
    'business-directory::tax-ids::read',
    'business-directory::tax-ids::write',
  ],
};
