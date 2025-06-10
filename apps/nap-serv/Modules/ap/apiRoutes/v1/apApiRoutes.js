'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import apCreditMemosApi from './apCreditMemosApi.js';
import apInvoicesApi from './apInvoicesApi.js';
import apInvoiceLinesApi from './apInvoiceLinesApi.js';
import paymentsApi from './paymentsApi.js';

const router = express.Router();
router.use('/v1/ap-credit-memos', apCreditMemosApi);
router.use('/v1/ap-invoices', apInvoicesApi);
router.use('/v1/ap-invoice-lines', apInvoiceLinesApi);
router.use('/v1/payments', paymentsApi);
// Add any additional API routes here

console.log('AP API Routes loaded');

export default router;
