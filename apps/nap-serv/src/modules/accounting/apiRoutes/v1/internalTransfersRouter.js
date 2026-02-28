/**
 * @file Internal Transfers router — /api/accounting/v1/internal-transfers
 * @module accounting/apiRoutes/v1/internalTransfersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import internalTransfersController from '../../controllers/internalTransfersController.js';

export default createRouter(internalTransfersController);
