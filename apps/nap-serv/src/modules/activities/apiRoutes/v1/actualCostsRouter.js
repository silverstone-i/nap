/**
 * @file ActualCosts router — /api/activities/v1/actual-costs
 * @module activities/apiRoutes/v1/actualCostsRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import actualCostsController from '../../controllers/actualCostsController.js';

const meta = withMeta({ module: 'activities', router: 'actual-costs' });

export default createRouter(actualCostsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
