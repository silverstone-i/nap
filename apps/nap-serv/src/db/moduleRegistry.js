/**
 * @file Central module registry — maps modules to their repositories and migrations
 * @module nap-serv/db/moduleRegistry
 *
 * Modules are added here as each phase is implemented. Each module entry
 * specifies its scope (admin or tenant), its repository map, and its
 * migration list.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import authRepositories from '../modules/auth/authRepositories.js';
import bootstrapAdmin from '../modules/auth/schema/migrations/202502110001_bootstrapAdmin.js';
import coreRepositories from '../modules/core/coreRepositories.js';
import coreMigrations from '../modules/core/schema/migrations/index.js';
import projectsRepositories from '../../Modules/projects/projectsRepositories.js';
import projectsMigrations from '../../Modules/projects/schema/migrations/index.js';
import activitiesRepositories from '../../Modules/activities/activitiesRepositories.js';
import activitiesMigrations from '../../Modules/activities/schema/migrations/index.js';

const moduleRegistry = [
  {
    name: 'auth',
    scope: 'admin',
    repositories: authRepositories,
    migrations: [bootstrapAdmin],
  },
  {
    name: 'core',
    scope: 'tenant',
    repositories: coreRepositories,
    migrations: coreMigrations,
  },
  {
    name: 'projects',
    scope: 'tenant',
    repositories: projectsRepositories,
    migrations: projectsMigrations,
  },
  {
    name: 'activities',
    scope: 'tenant',
    repositories: activitiesRepositories,
    migrations: activitiesMigrations,
  },
];

export default moduleRegistry;
