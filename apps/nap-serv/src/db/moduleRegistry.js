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

import authRepositories from '../system/auth/authRepositories.js';
import authMigrations from '../system/auth/schema/migrations/index.js';
import coreRepositories from '../system/core/coreRepositories.js';
import coreMigrations from '../system/core/schema/migrations/index.js';
import projectsRepositories from '../modules/projects/projectsRepositories.js';
import projectsMigrations from '../modules/projects/schema/migrations/index.js';
import activitiesRepositories from '../modules/activities/activitiesRepositories.js';
import activitiesMigrations from '../modules/activities/schema/migrations/index.js';
import bomRepositories from '../modules/bom/bomRepositories.js';
import bomMigrations from '../modules/bom/schema/migrations/index.js';
import apRepositories from '../modules/ap/apRepositories.js';
import apMigrations from '../modules/ap/schema/migrations/index.js';
import arRepositories from '../modules/ar/arRepositories.js';
import arMigrations from '../modules/ar/schema/migrations/index.js';
import accountingRepositories from '../modules/accounting/accountingRepositories.js';
import accountingMigrations from '../modules/accounting/schema/migrations/index.js';
import reportsRepositories from '../modules/reports/reportsRepositories.js';
import reportsMigrations from '../modules/reports/schema/migrations/index.js';

const moduleRegistry = [
  {
    name: 'auth',
    scope: 'admin',
    repositories: authRepositories,
    migrations: authMigrations,
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
  {
    name: 'bom',
    scope: 'tenant',
    repositories: bomRepositories,
    migrations: bomMigrations,
  },
  {
    name: 'accounting',
    scope: 'tenant',
    repositories: accountingRepositories,
    migrations: accountingMigrations,
  },
  {
    name: 'ap',
    scope: 'tenant',
    repositories: apRepositories,
    migrations: apMigrations,
  },
  {
    name: 'ar',
    scope: 'tenant',
    repositories: arRepositories,
    migrations: arMigrations,
  },
  {
    name: 'reports',
    scope: 'tenant',
    repositories: reportsRepositories,
    migrations: reportsMigrations,
  },
];

export default moduleRegistry;
