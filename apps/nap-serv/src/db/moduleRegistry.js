/**
 * @file Central module registry — maps modules to their repositories and migrations
 * @module nap-serv/db/moduleRegistry
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

const moduleRegistry = [
  {
    name: 'tenants',
    scope: 'admin',
    repositories: (await import('../modules/tenants/tenantsRepositories.js')).default,
    migrations: (await import('../modules/tenants/schema/migrations/index.js')).default,
  },
  {
    name: 'core',
    scope: 'tenant',
    repositories: (await import('../modules/core/coreRepositories.js')).default,
    migrations: (await import('../modules/core/schema/migrations/index.js')).default,
  },
];

export default moduleRegistry;
