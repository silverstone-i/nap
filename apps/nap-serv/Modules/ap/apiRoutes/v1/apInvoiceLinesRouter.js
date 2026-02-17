/**
 * @file AP Invoice Lines router — /api/ap/v1/ap-invoice-lines
 * @module ap/apiRoutes/v1/apInvoiceLinesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import apInvoiceLinesController from '../../controllers/apInvoiceLinesController.js';

export default createRouter(apInvoiceLinesController);
