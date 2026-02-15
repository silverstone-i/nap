/**
 * @file Aggregated repository map built from module registry
 * @module nap-serv/db/repositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import moduleRegistry from './moduleRegistry.js';

export const enabledModules = moduleRegistry.map((module) => module.name);

const repositories = {};

for (const module of moduleRegistry) {
  Object.assign(repositories, module.repositories);
}

export default repositories;
