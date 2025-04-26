'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const enabledModules = ['shared', 'tenants', 'projectActivities']; // TODO: Load dynamically per tenant or env config

const repositories = {};

for (const moduleName of enabledModules) {
  const modulePath = `../../modules/${moduleName}/${moduleName}Repositories.js`;
  console.log('Loading module:', modulePath);
  
  const { default: moduleRepositories } = await import(modulePath);
  Object.assign(repositories, moduleRepositories);  
}

export default repositories;
