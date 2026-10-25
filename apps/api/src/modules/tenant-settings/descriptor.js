/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-tenant-settings.js';

/**
 * Module descriptor for `tenant-settings` (M0006). It registers the
 * `app.tenant_settings`, `app.file_storage`, and `app.files` tables, the baseline migration, and its route
 * capabilities with the cell registry. It must follow `access-control` in
 * the registry, because its migration reuses `app.protect_record()`. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'tenant-settings',
  databaseTarget: 'cell',
  schema: 'app',
  // Every tenant has a settings row from provisioning (M0006-01-R009), so no
  // entitlement gates it.
  entitlementType: 'foundation',
  models: repositories,
  migrations: [migration],
  // M0006-01 §4 and §10; M0006-02 §4 and §10.
  capabilities: [
    'tenant-settings::general::read',
    'tenant-settings::general::write',
    'tenant-settings::storage::read',
    'tenant-settings::storage::write',
  ],
};
