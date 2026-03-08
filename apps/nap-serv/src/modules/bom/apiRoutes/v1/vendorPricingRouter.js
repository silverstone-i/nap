/**
 * @file VendorPricing router — /api/bom/v1/vendor-pricing
 * @module bom/apiRoutes/v1/vendorPricingRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import vendorPricingController from '../../controllers/vendorPricingController.js';

const meta = withMeta({ module: 'bom', router: 'vendor-skus' });

export default createRouter(vendorPricingController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
