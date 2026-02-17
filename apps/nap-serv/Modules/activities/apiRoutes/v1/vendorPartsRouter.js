/**
 * @file VendorParts router — /api/activities/v1/vendor-parts
 * @module activities/apiRoutes/v1/vendorPartsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import vendorPartsController from '../../controllers/vendorPartsController.js';

export default createRouter(vendorPartsController);
