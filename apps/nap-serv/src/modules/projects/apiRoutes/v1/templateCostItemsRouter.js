/**
 * @file Template cost items router — /api/projects/v1/template-cost-items
 * @module projects/apiRoutes/v1/templateCostItemsRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import templateCostItemsController from '../../controllers/templateCostItemsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'projects', router: 'template-cost-items' });

export default createRouter(templateCostItemsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
