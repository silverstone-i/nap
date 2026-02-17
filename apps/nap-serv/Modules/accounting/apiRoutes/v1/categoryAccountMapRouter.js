/**
 * @file Category-Account Map router — /api/accounting/v1/categories-account-map
 * @module accounting/apiRoutes/v1/categoryAccountMapRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import categoryAccountMapController from '../../controllers/categoryAccountMapController.js';

export default createRouter(categoryAccountMapController);
