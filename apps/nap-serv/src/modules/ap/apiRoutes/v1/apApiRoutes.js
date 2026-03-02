/**
 * @file AP module route aggregator — mounts AP sub-routers under /api/ap
 * @module ap/apiRoutes/v1/apApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import apInvoicesRouter from './apInvoicesRouter.js';
import apInvoiceLinesRouter from './apInvoiceLinesRouter.js';
import paymentsRouter from './paymentsRouter.js';
import apCreditMemosRouter from './apCreditMemosRouter.js';

const router = Router();

router.use('/v1/ap-invoices', apInvoicesRouter);
router.use('/v1/ap-invoice-lines', apInvoiceLinesRouter);
router.use('/v1/payments', paymentsRouter);
router.use('/v1/ap-credit-memos', apCreditMemosRouter);

export default router;
