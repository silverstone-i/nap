/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-reference-data.js';
import { seedReferenceData } from './seeds/referenceSeed.js';

/**
 * Module descriptor for `reference-data` (M0004). It registers the three
 * `reference` tables, the baseline migration, the lookup capability, and
 * the seed step that cell provisioning runs (I0003-R009, M0004-R005).
 * See docs/architecture/module-design.md for the descriptor fields.
 */
export const descriptor = {
  name: 'reference-data',
  databaseTarget: 'cell',
  schema: 'reference',
  entitlementType: 'infrastructure',
  models: repositories,
  migrations: [migration],
  capabilities: ['reference-data::lookups::read'],
  seed: handle => seedReferenceData(handle.db),
};
