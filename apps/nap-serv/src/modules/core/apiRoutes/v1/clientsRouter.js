/**
 * @file Clients router — /api/core/v1/clients
 * @module core/apiRoutes/v1/clientsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import clientsController from '../../controllers/clientsController.js';

export default createRouter(clientsController);
