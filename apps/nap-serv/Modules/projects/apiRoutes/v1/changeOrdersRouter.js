/**
 * @file Change orders router — /api/projects/v1/change-orders
 * @module projects/apiRoutes/v1/changeOrdersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import changeOrdersController from '../../controllers/changeOrdersController.js';
import { withMeta } from '../../../../src/middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'change-orders' });

export default createRouter(changeOrdersController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
