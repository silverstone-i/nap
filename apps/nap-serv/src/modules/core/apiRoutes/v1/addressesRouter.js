/**
 * @file Addresses router — /api/core/v1/addresses
 * @module core/apiRoutes/v1/addressesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import addressesController from '../../controllers/addressesController.js';

export default createRouter(addressesController);
