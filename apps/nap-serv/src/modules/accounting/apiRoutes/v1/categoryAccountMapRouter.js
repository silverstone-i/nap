/**
 * @file Category-Account Map router — /api/accounting/v1/category-account-map
 * @module accounting/apiRoutes/v1/categoryAccountMapRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import categoryAccountMapController from '../../controllers/categoryAccountMapController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'accounting', router: 'category-account-map' });

export default createRouter(categoryAccountMapController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
