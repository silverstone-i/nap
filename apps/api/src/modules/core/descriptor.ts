/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { migration as rbacMigration } from './schema/migrations/002-rbac.js';
import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-identity.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
/** Does: Registers this module in the cell. Used by: migration composition. */
export const descriptor = {
  entitlement: 'foundation',
  name: 'core',
  databaseTarget: 'cell',
  schema: 'app',
  models: repositories,
  migrations: [migration, rbacMigration],
} satisfies NapModuleDescriptor;
