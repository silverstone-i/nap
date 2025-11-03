'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import moduleRegistry from './moduleRegistry.js';

export const enabledModules = moduleRegistry.map(module => module.name);

const repositories = {};

for (const module of moduleRegistry) {
  Object.assign(repositories, module.repositories);
}

export default repositories;
