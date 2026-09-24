/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-cell-tenancy.js';

/**
 * Module descriptor for `cell-tenancy`. It registers the five `cell` table
 * models and the frozen baseline migration with the cell registry. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'cell-tenancy',
  databaseTarget: 'cell',
  schema: 'cell',
  entitlementType: 'infrastructure',
  models: repositories,
  migrations: [migration],
};
