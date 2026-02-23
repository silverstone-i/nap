/**
 * @file ActualCosts router — /api/activities/v1/actual-costs
 * @module activities/apiRoutes/v1/actualCostsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import actualCostsController from '../../controllers/actualCostsController.js';

export default createRouter(actualCostsController);
