/**
 * @file AR module route aggregator — mounts AR sub-routers under /api/ar
 * @module ar/apiRoutes/v1/arApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import arClientsRouter from './arClientsRouter.js';
import arInvoicesRouter from './arInvoicesRouter.js';
import arInvoiceLinesRouter from './arInvoiceLinesRouter.js';
import receiptsRouter from './receiptsRouter.js';

const router = Router();

router.use('/v1/clients', arClientsRouter);
router.use('/v1/ar-invoices', arInvoicesRouter);
router.use('/v1/ar-invoice-lines', arInvoiceLinesRouter);
router.use('/v1/receipts', receiptsRouter);

export default router;
