'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const enabledModules = ['core', 'projects']; // TODO: Load dynamically per tenant or env config

const repositories = {};

for (const moduleName of enabledModules) {
  // Use dynamic import to load the module
  const modulePath = `../../modules/${moduleName}/${moduleName}Repositories.js`;

  const { default: moduleRepositories } = await import(modulePath);
  Object.assign(repositories, moduleRepositories);
  // console.log('Loaded repositories:', Object.keys(moduleRepositories));
  // console.log('Current repositories:', Object.keys(repositories));
}

export default repositories;
