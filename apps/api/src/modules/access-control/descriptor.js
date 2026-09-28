/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-access-control.js';

/**
 * Module descriptor for `access-control` (M0003). It registers the three
 * `app` role tables, the baseline migration, and its route capabilities
 * (M0003-R005) with the cell registry. See
 * docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'access-control',
  databaseTarget: 'cell',
  schema: 'app',
  entitlementType: 'foundation',
  models: repositories,
  migrations: [migration],
  // M0003 §4 and §10.
  capabilities: [
    'access-control::roles::read',
    'access-control::roles::write',
    'access-control::assignments::write',
  ],
};
