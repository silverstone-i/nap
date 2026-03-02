/**
 * @file AR module route aggregator — mounts AR sub-routers under /api/ar
 * @module ar/apiRoutes/v1/arApiRoutes
 *
 * No ar_clients routes — PRD removed ar_clients table.
 * AR invoices reference the unified clients table from core entities.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import arInvoicesRouter from './arInvoicesRouter.js';
import arInvoiceLinesRouter from './arInvoiceLinesRouter.js';
import receiptsRouter from './receiptsRouter.js';

const router = Router();

router.use('/v1/ar-invoices', arInvoicesRouter);
router.use('/v1/ar-invoice-lines', arInvoiceLinesRouter);
router.use('/v1/receipts', receiptsRouter);

export default router;
