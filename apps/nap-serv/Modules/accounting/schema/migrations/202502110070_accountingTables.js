/**
 * @file Migration: create Accounting / GL module tables
 * @module accounting/schema/migrations/202502110070_accountingTables
 *
 * Tables created in FK dependency order:
 *   chart_of_accounts (no deps)
 *   journal_entries (self-ref corrects_id)
 *   journal_entry_lines → journal_entries, chart_of_accounts
 *   ledger_balances → chart_of_accounts
 *   posting_queues → journal_entries
 *   category_account_map → chart_of_accounts
 *   inter_company_accounts (company FKs)
 *   inter_company_transactions → journal_entries
 *   internal_transfers → chart_of_accounts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

const ACCOUNTING_MODELS = [
  'chartOfAccounts',
  'journalEntries',
  'journalEntryLines',
  'ledgerBalances',
  'postingQueues',
  'categoryAccountMap',
  'interCompanyAccounts',
  'interCompanyTransactions',
  'internalTransfers',
];

export default defineMigration({
  id: '202502110070-accounting-tables',
  description: 'Create Accounting / GL module tables',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    // Create tables in FK order
    for (const key of ACCOUNTING_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models, db }) {
    if (schema === 'admin') return;

    // Drop tables in reverse FK order
    const reversed = [...ACCOUNTING_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
