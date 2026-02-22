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

const moduleRegistry = [
  {
    name: 'auth',
    scope: 'admin',
    repositories: authRepositories,
    migrations: [bootstrapAdmin],
  },
];

export default moduleRegistry;
