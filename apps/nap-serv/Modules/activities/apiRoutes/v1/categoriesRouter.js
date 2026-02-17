/**
 * @file Categories router — /api/activities/v1/categories
 * @module activities/apiRoutes/v1/categoriesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import categoriesController from '../../controllers/categoriesController.js';

export default createRouter(categoriesController);
