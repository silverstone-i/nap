/**
 * @file TemplateChangeOrders router — /api/projects/v1/template-change-orders
 * @module projects/apiRoutes/v1/templateChangeOrdersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import templateChangeOrdersController from '../../controllers/templateChangeOrdersController.js';

export default createRouter(templateChangeOrdersController);
