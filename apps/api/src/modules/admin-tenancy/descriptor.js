/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { PLATFORM_ADMIN_CAPABILITIES } from '../../capability/systemRoles.js';
import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-admin-tenancy.js';

/**
 * Module descriptor for `admin-tenancy`. It registers the twelve admin table
 * models and the frozen baseline migration with the admin registry. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'admin-tenancy',
  databaseTarget: 'admin',
  schema: 'admin',
  entitlementType: 'infrastructure',
  models: repositories,
  migrations: [migration],
  // M0003-R005: the capabilities its routes check today.
  capabilities: PLATFORM_ADMIN_CAPABILITIES.filter(capability =>
    capability.startsWith('admin-tenancy::')
  ),
};
