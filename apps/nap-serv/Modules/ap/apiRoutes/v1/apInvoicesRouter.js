/**
 * @file AP Invoices router — /api/ap/v1/ap-invoices
 * @module ap/apiRoutes/v1/apInvoicesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import apInvoicesController from '../../controllers/apInvoicesController.js';

export default createRouter(apInvoicesController);
