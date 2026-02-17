/**
 * @file Intercompany service — paired journal entries for intercompany transactions
 * @module accounting/services/intercompanyService
 *
 * Creates paired journal entries (due-to/due-from) between companies.
 * Carries elimination flags for consolidated reporting.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';
import { createJournalEntry } from './postingService.js';

const VALID_MODULES = ['ar', 'ap', 'je'];

/**
 * Create an intercompany transaction with paired journal entries.
 * @param {string} schema Tenant schema name
 * @param {object} data Transaction data
 * @returns {Promise<object>} The created intercompany transaction
 */
async function createIntercompanyTransaction(schema, data) {
  const {
    tenant_id, source_company_id, target_company_id,
    module, amount, description,
    sourceAccountId, targetAccountId, intercompanyAccountId,
  } = data;

  if (!VALID_MODULES.includes(module)) {
    throw new Error(`Invalid module: ${module}. Must be one of: ${VALID_MODULES.join(', ')}`);
  }

  if (!amount || parseFloat(amount) <= 0) {
    throw new Error('Intercompany transaction amount must be positive');
  }

  const parsedAmount = parseFloat(amount);
  const entryDate = new Date().toISOString().split('T')[0];

  return db.tx(async (t) => {
    // Create source company journal entry (due-from target)
    const sourceEntry = await createJournalEntry(schema, {
      tenant_id,
      company_id: source_company_id,
      entry_date: entryDate,
      description: `IC: ${description || 'Intercompany transaction'} (source)`,
      source_type: 'intercompany',
      lines: [
        { account_id: intercompanyAccountId, debit: parsedAmount, credit: 0, memo: 'Due from target company' },
        { account_id: sourceAccountId, debit: 0, credit: parsedAmount, memo: 'Source offset' },
      ],
    });

    // Create target company journal entry (due-to source)
    const targetEntry = await createJournalEntry(schema, {
      tenant_id,
      company_id: target_company_id,
      entry_date: entryDate,
      description: `IC: ${description || 'Intercompany transaction'} (target)`,
      source_type: 'intercompany',
      lines: [
        { account_id: targetAccountId, debit: parsedAmount, credit: 0, memo: 'Target offset' },
        { account_id: intercompanyAccountId, debit: 0, credit: parsedAmount, memo: 'Due to source company' },
      ],
    });

    // Create the intercompany transaction record
    const txn = await t.one(
      `INSERT INTO ${schema}.inter_company_transactions
       (tenant_id, source_company_id, target_company_id, source_journal_entry_id, target_journal_entry_id, module, amount, status, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       RETURNING *`,
      [tenant_id, source_company_id, target_company_id, sourceEntry.id, targetEntry.id, module, parsedAmount, description || null],
    );

    logger.info(`Intercompany transaction ${txn.id} created: ${source_company_id} → ${target_company_id}, amount: ${parsedAmount}`);
    return txn;
  });
}

export { createIntercompanyTransaction, VALID_MODULES };
