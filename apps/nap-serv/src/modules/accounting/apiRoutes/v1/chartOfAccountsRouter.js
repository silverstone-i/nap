/**
 * @file Chart of Accounts router — /api/accounting/v1/chart-of-accounts
 * @module accounting/apiRoutes/v1/chartOfAccountsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import chartOfAccountsController from '../../controllers/chartOfAccountsController.js';

export default createRouter(chartOfAccountsController);
