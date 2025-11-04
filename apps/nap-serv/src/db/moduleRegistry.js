'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const moduleRegistry = [
  {
    name: 'tenants',
    scope: 'admin',
    repositories: (await import('../../modules/tenants/tenantsRepositories.js')).default,
    migrations: (await import('../../modules/tenants/schema/migrations/index.js')).default,
  },
  {
    name: 'core',
    scope: 'tenant',
    repositories: (await import('../../modules/core/coreRepositories.js')).default,
    migrations: (await import('../../modules/core/schema/migrations/index.js')).default,
  },
  {
    name: 'projects',
    scope: 'tenant',
    repositories: (await import('../../modules/projects/projectsRepositories.js')).default,
    migrations: (await import('../../modules/projects/schema/migrations/index.js')).default,
  },
  {
    name: 'bom',
    scope: 'tenant',
    repositories: (await import('../../modules/bom/bomRepositories.js')).default,
    migrations: (await import('../../modules/bom/schema/migrations/index.js')).default,
  },
  {
    name: 'views',
    scope: 'tenant',
    repositories: (await import('../../modules/views/viewsRepositories.js')).default,
    migrations: (await import('../../modules/views/schema/migrations/index.js')).default,
  },
];

export default moduleRegistry;
