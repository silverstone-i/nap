/**
 * @file Core module migrations index
 * @module core/schema/migrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import coreTables from './202502110010_coreTables.js';
import coreEntityTables from './202502110011_coreEntityTables.js';
import rbacScopeTables from './202502180012_rbacScopeTables.js';

export default [coreTables, coreEntityTables, rbacScopeTables];
