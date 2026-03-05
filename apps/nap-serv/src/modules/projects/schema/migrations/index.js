/**
 * @file Migration index for the projects module
 * @module projects/schema/migrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import projectEntities from './202502110020_projectEntities.js';
import statusChecks from './202503050021_statusChecks.js';

export default [projectEntities, statusChecks];
