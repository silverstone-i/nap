/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModule } from '../../db/index.js';
import { Tenants } from './models/Tenants.js';

declare module 'pg-schemata' {
  interface Repositories {
    tenants: Tenants;
  }
}

/** Registry descriptor for the tenants module (ADR-0001, ADR-0005). */
export const tenantsModule: NapModule = {
  name: 'tenants',
  schemaScope: 'admin',
  licensable: false,
  models: { tenants: Tenants },
  migrations: [],
};
