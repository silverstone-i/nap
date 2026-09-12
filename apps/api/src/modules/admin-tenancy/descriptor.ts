/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { migration as m0 } from './schema/migrations/001-identity-tenancy.js';
import { migration as m1 } from './schema/migrations/002-authentication.js';
import { migration as m2 } from './schema/migrations/003-authorization.js';
import { migration as m3 } from './schema/migrations/004-provisioning-audit.js';
import { migration as m4 } from './schema/migrations/005-cache-revisions.js';
import { repositories } from './repositories.js';
import type { NapModuleDescriptor } from '../../db/modules.js';
/** Does: Registers the admin baseline. Used by: admin migration composition. */
export const descriptor = {
  entitlement: 'infrastructure',
  name: 'admin-tenancy',
  databaseTarget: 'admin',
  schema: 'admin',
  models: repositories,
  migrations: [m0, m1, m2, m3, m4],
} satisfies NapModuleDescriptor;
