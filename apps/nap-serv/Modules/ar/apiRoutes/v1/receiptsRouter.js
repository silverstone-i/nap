/**
 * @file Receipts router — /api/ar/v1/receipts
 * @module ar/apiRoutes/v1/receiptsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import receiptsController from '../../controllers/receiptsController.js';

export default createRouter(receiptsController);
