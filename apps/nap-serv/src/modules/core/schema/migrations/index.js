/**
 * @file Core module migrations index
 * @module core/schema/migrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import coreRbac from './202502110010_coreRbac.js';
import coreEntities from './202502110011_coreEntities.js';
import entityRbacColumns from './202502110012_entityRbacColumns.js';

export default [coreRbac, coreEntities, entityRbacColumns];
