/**
 * @file CostLines router — /api/activities/v1/cost-lines
 * @module activities/apiRoutes/v1/costLinesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import costLinesController from '../../controllers/costLinesController.js';

const meta = withMeta({ module: 'activities', router: 'cost-lines' });

export default createRouter(costLinesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
