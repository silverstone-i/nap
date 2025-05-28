'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import CategoriesAccountMap from './models/CategoriesAccountMap.js';
import ChartOfAccounts from './models/ChartOfAccounts.js';
import InternalTransfers from './models/InternalTransfers.js';
import JournalEntries from './models/JournalEntries.js';
import JournalEntryLines from './models/JournalEntryLines.js';
import LedgerBalances from './models/LedgerBalances.js';
import PostingQueues from './models/PostingQueues.js';
import InterCompanyAccounts from './models/InterCompanyAccounts.js';
import InterCompanyTransactions from './models/InterCompanyTransactions.js';

const repositories = {
  categoriesAccountMap: CategoriesAccountMap,
  chartOfAccounts: ChartOfAccounts,
  internalTransfers: InternalTransfers,
  journalEntries: JournalEntries,
  journalEntryLines: JournalEntryLines,
  ledgerBalances: LedgerBalances,
  postingQueues: PostingQueues,
  interCompanyAccounts: InterCompanyAccounts,
  interCompanyTransactions: InterCompanyTransactions,
};

export default repositories;