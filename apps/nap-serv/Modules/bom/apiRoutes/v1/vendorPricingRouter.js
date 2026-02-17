/**
 * @file VendorPricing router — /api/bom/v1/vendor-pricing
 * @module bom/apiRoutes/v1/vendorPricingRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import vendorPricingController from '../../controllers/vendorPricingController.js';

export default createRouter(vendorPricingController);
