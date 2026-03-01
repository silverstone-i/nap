/**
 * @file Categories router — /api/activities/v1/categories
 * @module activities/apiRoutes/v1/categoriesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import categoriesController from '../../controllers/categoriesController.js';

const meta = withMeta({ module: 'activities', router: 'categories' });

export default createRouter(categoriesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
