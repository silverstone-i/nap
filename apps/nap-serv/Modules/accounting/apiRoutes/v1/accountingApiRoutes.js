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
import accountClassificationsApi from './accountClassificationsApi';
import categoriesAccountMapApi from './categoriesAccountMapApi';
import chartOfAccountsApi from './chartOfAccountsApi';
import interCompanyAccountsApi from './interCompanyAccountsApi';
import interCompanyTransactionsApi from './interCompanyTransactionsApi';
import internalTransfersApi from './internalTransfersApi';
import journalEntriesApi from './journalEntriesApi';
import journalEntryLinesApi from './journalEntryLinesApi';
import ledgerBalancesApi from './ledgerBalancesApi';
import postingQueuesApi from './postingQueuesApi';

const router = express.Router();

router.use('/v1/account-classifications', accountClassificationsApi);
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

