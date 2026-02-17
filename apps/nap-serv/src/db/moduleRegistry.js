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
  {
    name: 'projects',
    scope: 'tenant',
    repositories: (await import('../../Modules/projects/projectsRepositories.js')).default,
    migrations: (await import('../../Modules/projects/schema/migrations/index.js')).default,
  },
  {
    name: 'activities',
    scope: 'tenant',
    repositories: (await import('../../Modules/activities/activitiesRepositories.js')).default,
    migrations: (await import('../../Modules/activities/schema/migrations/index.js')).default,
  },
  {
    name: 'bom',
    scope: 'tenant',
    repositories: (await import('../../Modules/bom/bomRepositories.js')).default,
    migrations: (await import('../../Modules/bom/schema/migrations/index.js')).default,
  },
  {
    name: 'ap',
    scope: 'tenant',
    repositories: (await import('../../Modules/ap/apRepositories.js')).default,
    migrations: (await import('../../Modules/ap/schema/migrations/index.js')).default,
  },
  {
    name: 'ar',
    scope: 'tenant',
    repositories: (await import('../../Modules/ar/arRepositories.js')).default,
    migrations: (await import('../../Modules/ar/schema/migrations/index.js')).default,
  },
  {
    name: 'accounting',
    scope: 'tenant',
    repositories: (await import('../../Modules/accounting/accountingRepositories.js')).default,
    migrations: (await import('../../Modules/accounting/schema/migrations/index.js')).default,
  },
];

export default moduleRegistry;
