/**
 * @file CostItems router — /api/projects/v1/cost-items
 * @module projects/apiRoutes/v1/costItemsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import costItemsController from '../../controllers/costItemsController.js';

export default createRouter(costItemsController);
