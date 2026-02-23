/**
 * @file AP Credit Memos router — /api/ap/v1/ap-credit-memos
 * @module ap/apiRoutes/v1/apCreditMemosRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import apCreditMemosController from '../../controllers/apCreditMemosController.js';

export default createRouter(apCreditMemosController);
