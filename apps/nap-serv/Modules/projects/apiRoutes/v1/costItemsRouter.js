/**
 * @file Cost items router — /api/projects/v1/cost-items
 * @module projects/apiRoutes/v1/costItemsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import costItemsController from '../../controllers/costItemsController.js';
import { withMeta } from '../../../../src/middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'cost-items' });

export default createRouter(costItemsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
