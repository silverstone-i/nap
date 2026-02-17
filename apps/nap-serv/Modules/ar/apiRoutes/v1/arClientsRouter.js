/**
 * @file AR Clients router — /api/ar/v1/clients
 * @module ar/apiRoutes/v1/arClientsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import arClientsController from '../../controllers/arClientsController.js';

export default createRouter(arClientsController);
