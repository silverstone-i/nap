/**
 * @file Inter-Company Transactions router — /api/accounting/v1/inter-company-transactions
 * @module accounting/apiRoutes/v1/interCompanyTransactionsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import interCompanyTransactionsController from '../../controllers/interCompanyTransactionsController.js';

export default createRouter(interCompanyTransactionsController);
