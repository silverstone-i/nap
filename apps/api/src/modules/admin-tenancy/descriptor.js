/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-admin-tenancy.js';

export const descriptor = {
  name: 'admin-tenancy',
  databaseTarget: 'admin',
  schema: 'admin',
  entitlementType: 'infrastructure',
  models: repositories,
  migrations: [migration],
};
