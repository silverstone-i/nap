/**
 * @file Core module migrations index
 * @module core/schema/migrations
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import coreRbac from './202502110010_coreRbac.js';
import coreEntities from './202502110011_coreEntities.js';
import numberingSystem from './202502250012_numberingSystem.js';
import importExportCatalog from './202603150013_importExportCatalog.js';
export default [coreRbac, coreEntities, numberingSystem, importExportCatalog];
