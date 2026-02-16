/**
 * @file Vendors router — /api/core/v1/vendors
 * @module core/apiRoutes/v1/vendorsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import vendorsController from '../../controllers/vendorsController.js';

export default createRouter(vendorsController);
