/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-admin-tenancy.js';
import { migration as cellSeedAction } from './schema/migrations/002-cell-seed-action.js';

/**
 * Module descriptor for `admin-tenancy`. It registers the twelve admin table
 * models, the frozen baseline migration, and later migrations with the admin
 * registry. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'admin-tenancy',
  databaseTarget: 'admin',
  schema: 'admin',
  entitlementType: 'infrastructure',
  models: repositories,
  migrations: [migration, cellSeedAction],
  // M0003-R005: the route capabilities it declares.
  capabilities: [
    'admin-tenancy::control::read',
    'admin-tenancy::control::write',
    'admin-tenancy::accounts::read',
    'admin-tenancy::accounts::write',
    'admin-tenancy::sessions::revoke',
    'admin-tenancy::entitlements::read',
    'admin-tenancy::entitlements::write',
    'admin-tenancy::events::read',
  ],
};
