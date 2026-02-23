/**
 * @file CostLines router — /api/activities/v1/cost-lines
 * @module activities/apiRoutes/v1/costLinesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import costLinesController from '../../controllers/costLinesController.js';

export default createRouter(costLinesController);
