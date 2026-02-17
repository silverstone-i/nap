/**
 * @file TemplateCostItems router — /api/projects/v1/template-cost-items
 * @module projects/apiRoutes/v1/templateCostItemsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import templateCostItemsController from '../../controllers/templateCostItemsController.js';

export default createRouter(templateCostItemsController);
