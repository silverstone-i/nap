/**
 * @file Inter-Company Accounts router — /api/accounting/v1/inter-company-accounts
 * @module accounting/apiRoutes/v1/interCompanyAccountsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import interCompanyAccountsController from '../../controllers/interCompanyAccountsController.js';

export default createRouter(interCompanyAccountsController);
