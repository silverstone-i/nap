'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import moduleRegistry from '../moduleRegistry.js';

export const adminModules = moduleRegistry
  .filter(module => module.scope === 'admin' || module.scope === 'shared')
  .map(module => module.name);

export const tenantModules = moduleRegistry
  .filter(module => module.scope !== 'admin')
  .map(module => module.name);

export function getModulesForSchema(schemaName) {
  return schemaName === 'admin' ? adminModules : tenantModules;
}
