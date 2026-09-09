/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { migration as rbacMigration } from './schema/migrations/007-rbac.js';
import { migration as cacheMigration } from './schema/migrations/008-cache-revisions.js';
import { repositories } from './repositories.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
import { migration as migration1 } from './schema/migrations/001-tenants.js';
import { migration as migration2 } from './schema/migrations/002-portal_users.js';
import { migration as migration3 } from './schema/migrations/003-portal_user_tenants.js';
import { migration as migration4 } from './schema/migrations/004-sessions.js';
import { migration as migration5 } from './schema/migrations/005-login_throttles.js';

import { migration as migration6 } from './schema/migrations/006-control-plane.js';

/**
 * Does: Registers authentication tables and migrations in the admin database.
 * Used by: the admin module registry.
 */
export const descriptor = {
  entitlement: 'infrastructure',
  name: 'admin-tenancy',
  databaseTarget: 'admin',
  schema: 'admin',
  models: repositories,
  migrations: [
    migration1,
    migration2,
    migration3,
    migration4,
    migration5,
    migration6,
    rbacMigration,
    cacheMigration,
  ],
} satisfies NapModuleDescriptor;
