/**
 * @file Repository map for the Accounting module (tenant-scope)
 * @module accounting/accountingRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ChartOfAccounts from './models/ChartOfAccounts.js';
import JournalEntries from './models/JournalEntries.js';
import JournalEntryLines from './models/JournalEntryLines.js';
import LedgerBalances from './models/LedgerBalances.js';
import PostingQueues from './models/PostingQueues.js';
import CategoryAccountMap from './models/CategoryAccountMap.js';
import InterCompanyAccounts from './models/InterCompanyAccounts.js';
import InterCompanyTransactions from './models/InterCompanyTransactions.js';
import InternalTransfers from './models/InternalTransfers.js';

const repositories = {
  chartOfAccounts: ChartOfAccounts,
  journalEntries: JournalEntries,
  journalEntryLines: JournalEntryLines,
  ledgerBalances: LedgerBalances,
  postingQueues: PostingQueues,
  categoryAccountMap: CategoryAccountMap,
  interCompanyAccounts: InterCompanyAccounts,
  interCompanyTransactions: InterCompanyTransactions,
  internalTransfers: InternalTransfers,
};

export default repositories;
