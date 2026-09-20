/* Copyright (c) 2026–present NapSoft, LLC. SPDX-License-Identifier: AGPL-3.0-or-later */
import { repositories } from './repositories.js';
import { migration } from './schema/migrations/001-role-catalogue.js';

export const descriptor = {
  name: 'access-control',
  databaseTarget: 'cell',
  schema: 'app',
  entitlementType: 'foundation',
  models: repositories,
  migrations: [migration],
};
