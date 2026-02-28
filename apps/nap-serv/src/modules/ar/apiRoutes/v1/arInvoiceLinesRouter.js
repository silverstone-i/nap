/**
 * @file AR Invoice Lines router — /api/ar/v1/ar-invoice-lines
 * @module ar/apiRoutes/v1/arInvoiceLinesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import arInvoiceLinesController from '../../controllers/arInvoiceLinesController.js';

export default createRouter(arInvoiceLinesController);
