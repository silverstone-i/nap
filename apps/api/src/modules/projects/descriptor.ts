/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-projects.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
/** Does: Registers Projects in its cell. Used by: database composition. */
export const descriptor = {
  entitlement: 'optional',
  name: 'projects',
  databaseTarget: 'cell',
  schema: 'app',
  models: repositories,
  migrations: [migration],
} satisfies NapModuleDescriptor;
