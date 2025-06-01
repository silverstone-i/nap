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
import categoriesAccountMapApi from './categoriesAccountMapApi.js';
import chartOfAccountsApi from './chartOfAccountsApi.js';
import interCompanyAccountsApi from './interCompanyAccountsApi.js';
import interCompanyTransactionsApi from './interCompanyTransactionsApi.js';
import internalTransfersApi from './internalTransfersApi.js';
import journalEntriesApi from './journalEntriesApi.js';
import journalEntryLinesApi from './journalEntryLinesApi.js';
import ledgerBalancesApi from './ledgerBalancesApi.js';
import postingQueuesApi from './postingQueuesApi.js';

const router = express.Router();

router.use('/v1/categories-account-map', categoriesAccountMapApi);
router.use('/v1/chart-of-accounts', chartOfAccountsApi);
router.use('/v1/inter-company-accounts', interCompanyAccountsApi);
router.use('/v1/inter-company-transactions', interCompanyTransactionsApi);
router.use('/v1/internal-transfers', internalTransfersApi);
router.use('/v1/journal-entries', journalEntriesApi);
router.use('/v1/journal-entry-lines', journalEntryLinesApi);
router.use('/v1/ledger-balances', ledgerBalancesApi);
router.use('/v1/posting-queues', postingQueuesApi);
// Add more routes as needed

console.log('Loaded accounting API router');


export default router;

