/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAccountsRouter } from './accounts.js';
import { createAuthRouter } from './auth.js';
import { createControlRouter } from './control.js';
import { createSessionRouter } from './session.js';
import { createSessionsRouter } from './sessions.js';
import { createTenantsRouter } from './tenants.js';

/**
 * Version 1 route registrations for `admin-tenancy`.
 *
 * Each entry names its module, router, version, and database target, as
 * docs/architecture/bff.md#api-routing requires; the route registry turns
 * them into `/api/admin-tenancy/v1/<router>` mounts.
 */
export const adminTenancyRoutesV1 = [
  {
    module: 'admin-tenancy',
    router: 'session',
    version: 1,
    database: 'admin',
    factory: createSessionRouter,
  },
  {
    module: 'admin-tenancy',
    router: 'sessions',
    version: 1,
    database: 'admin',
    factory: createSessionsRouter,
  },
  {
    module: 'admin-tenancy',
    router: 'auth',
    version: 1,
    database: 'admin',
    factory: createAuthRouter,
  },
  {
    module: 'admin-tenancy',
    router: 'control',
    version: 1,
    database: 'admin',
    factory: createControlRouter,
  },
  {
    module: 'admin-tenancy',
    router: 'tenants',
    version: 1,
    database: 'admin',
    factory: createTenantsRouter,
  },
  {
    module: 'admin-tenancy',
    router: 'accounts',
    version: 1,
    database: 'admin',
    factory: createAccountsRouter,
  },
];
