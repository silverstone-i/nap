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
import receiptsApi from './receiptsApi.js';
import clientsApi from './clientsApi.js';
import arInvoicesApi from './arInvoicesApi.js';
import arInvoiceLinesApi from './arInvoiceLinesApi.js';

const router = express.Router();

// Mount the sub-routers
router.use('/v1/receipts', receiptsApi);
router.use('/v1/clients', clientsApi);
router.use('/v1/arInvoices', arInvoicesApi);
router.use('/v1/arInvoiceLines', arInvoiceLinesApi);

// Export the router
export default router;