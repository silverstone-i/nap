/**
 * @file Payments router — /api/ap/v1/payments
 * @module ap/apiRoutes/v1/paymentsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import paymentsController from '../../controllers/paymentsController.js';

export default createRouter(paymentsController);
