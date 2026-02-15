/**
 * @file Central migration export — configures the migrator from module registry
 * @module nap-serv/db/migrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import moduleRegistry from '../moduleRegistry.js';
import logger from '../../utils/logger.js';
import { createMigrator } from './createMigrator.js';

const modules = Object.fromEntries(
  moduleRegistry.map((module) => [
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
