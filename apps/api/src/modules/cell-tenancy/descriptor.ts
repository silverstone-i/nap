/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { migration as rbacMigration } from './schema/migrations/002-entitlements.js';
import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-identity.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
/** Does: Registers this module in the cell. Used by: migration composition. */
export const descriptor = {
  entitlement: 'infrastructure',
  name: 'cell-tenancy',
  databaseTarget: 'cell',
  schema: 'cell',
  models: repositories,
  migrations: [migration, rbacMigration],
} satisfies NapModuleDescriptor;
