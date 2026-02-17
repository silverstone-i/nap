/**
 * @file ChangeOrders router — /api/projects/v1/change-orders
 * @module projects/apiRoutes/v1/changeOrdersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import changeOrdersController from '../../controllers/changeOrdersController.js';

export default createRouter(changeOrdersController);
