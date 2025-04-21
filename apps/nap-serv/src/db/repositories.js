'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const enabledModules = ['tenants']; // TODO: Load dynamically per tenant or env config

const repositories = {};

for (const moduleName of enabledModules) {
  const modulePath = `../../modules/${moduleName}/${moduleName.slice(0, -1)}Repositories.js`;
  const { default: moduleRepositories } = await import(modulePath);
  Object.assign(repositories, moduleRepositories);
}

export default repositories;
