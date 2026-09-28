/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-access-control.js';

/**
 * Module descriptor for `access-control` (M0003). It registers the three
 * `app` role tables and the baseline migration with the cell registry. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'access-control',
  databaseTarget: 'cell',
  schema: 'app',
  entitlementType: 'foundation',
  models: repositories,
  migrations: [migration],
};
