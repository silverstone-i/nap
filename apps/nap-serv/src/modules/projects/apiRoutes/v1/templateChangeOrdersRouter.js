/**
 * @file Template change orders router — /api/projects/v1/template-change-orders
 * @module projects/apiRoutes/v1/templateChangeOrdersRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import templateChangeOrdersController from '../../controllers/templateChangeOrdersController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'template-change-orders' });

export default createRouter(templateChangeOrdersController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
