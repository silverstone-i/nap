/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { migration } from './schema/migrations/001-reference.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
/** Does: Registers shared reference migrations. Used by: cell migration composition. */
export const descriptor = {
  name: 'reference-data',
  entitlement: 'foundation',
  databaseTarget: 'cell',
  schema: 'reference',
  models: {},
  migrations: [migration],
} satisfies NapModuleDescriptor;
