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
import logger from '../../utils/logger.js';
import { createMigrator } from './createMigrator.js';

const modules = Object.fromEntries(
  moduleRegistry.map(module => [
    module.name,
    {
      migrations: module.migrations ?? [],
      repositories: module.repositories ?? {},
      scope: module.scope ?? 'tenant',
    },
  ]),
);

export const migrator = createMigrator({ modules, logger });

export default migrator;
