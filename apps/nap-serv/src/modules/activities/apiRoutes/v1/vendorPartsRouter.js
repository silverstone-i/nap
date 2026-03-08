/**
 * @file VendorParts router — /api/activities/v1/vendor-parts
 * @module activities/apiRoutes/v1/vendorPartsRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import vendorPartsController from '../../controllers/vendorPartsController.js';

const meta = withMeta({ module: 'activities', router: 'vendor-parts' });

export default createRouter(vendorPartsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
