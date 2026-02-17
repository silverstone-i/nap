/**
 * @file Posting service — transactional GL journal entry creation, posting, and reversal
 * @module accounting/services/postingService
 *
 * All posting operations use db.tx() for transactional atomicity.
 * Provides hooks for AP, AR, and actual cost modules to create GL entries.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

/**
 * Create a journal entry with lines. Validates debits = credits.
 * @param {string} schema Tenant schema name
 * @param {object} data Entry data with lines array
 * @returns {Promise<object>} Created journal entry
 */
async function createJournalEntry(schema, data) {
  const { lines, ...entryData } = data;

  if (!lines || !Array.isArray(lines) || lines.length === 0) {
    throw new Error('Journal entry must have at least one line');
  }

  // Validate debits = credits
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    totalDebit += parseFloat(line.debit || 0);
    totalCredit += parseFloat(line.credit || 0);
  }

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new Error(`Journal entry does not balance: debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`);
  }

  // Create entry and lines in a transaction
  return db.tx(async (t) => {
    // Insert the journal entry header
    const entry = await t.one(
      `INSERT INTO ${schema}.journal_entries
       (tenant_id, company_id, project_id, entry_date, description, status, source_type, source_id, corrects_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        entryData.tenant_id, entryData.company_id, entryData.project_id || null,
        entryData.entry_date, entryData.description || null,
        entryData.status || 'pending', entryData.source_type || null,
        entryData.source_id || null, entryData.corrects_id || null,
      ],
    );

    // Insert all lines
    const insertedLines = [];
    for (const line of lines) {
      const inserted = await t.one(
        `INSERT INTO ${schema}.journal_entry_lines
         (entry_id, account_id, debit, credit, memo, related_table, related_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          entry.id, line.account_id,
          parseFloat(line.debit || 0), parseFloat(line.credit || 0),
          line.memo || null, line.related_table || null, line.related_id || null,
        ],
      );
      insertedLines.push(inserted);
    }

    // Create posting queue entry
    await t.none(
      `INSERT INTO ${schema}.posting_queues (tenant_id, journal_entry_id, status) VALUES ($1, $2, 'pending')`,
      [entryData.tenant_id, entry.id],
    );

    return { ...entry, lines: insertedLines };
  });
}

/**
 * Post a pending journal entry: update status, update ledger balances.
 * @param {string} schema Tenant schema name
 * @param {string} entryId Journal entry ID
 * @returns {Promise<object>} Posted entry
 */
async function postEntry(schema, entryId) {
  return db.tx(async (t) => {
    const entry = await t.oneOrNone(
      `SELECT * FROM ${schema}.journal_entries WHERE id = $1`,
      [entryId],
    );
    if (!entry) throw new Error('Journal entry not found');
    if (entry.status !== 'pending') throw new Error(`Cannot post entry with status: ${entry.status}`);

    // Get all lines
    const lines = await t.manyOrNone(
      `SELECT * FROM ${schema}.journal_entry_lines WHERE entry_id = $1`,
      [entryId],
    );

    // Update ledger balances for each line
    for (const line of lines) {
      const netAmount = parseFloat(line.debit) - parseFloat(line.credit);
      await t.none(
        `INSERT INTO ${schema}.ledger_balances (tenant_id, account_id, as_of_date, balance)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (account_id, as_of_date)
         DO UPDATE SET balance = ledger_balances.balance + $4`,
        [entry.tenant_id, line.account_id, entry.entry_date, netAmount],
      );
    }

    // Update entry status
    await t.none(
      `UPDATE ${schema}.journal_entries SET status = 'posted' WHERE id = $1`,
      [entryId],
    );

    // Update posting queue
    await t.none(
      `UPDATE ${schema}.posting_queues SET status = 'posted', processed_at = NOW() WHERE journal_entry_id = $1`,
      [entryId],
    );

    logger.info(`Journal entry ${entryId} posted successfully`);
    return { ...entry, status: 'posted' };
  });
}

/**
 * Reverse a posted entry by creating a correcting entry with flipped debits/credits.
 * @param {string} schema Tenant schema name
 * @param {string} entryId Entry ID to reverse
 * @param {string} tenantId Tenant ID
 * @returns {Promise<object>} The correcting journal entry
 */
async function reverseEntry(schema, entryId, tenantId) {
  return db.tx(async (t) => {
    const entry = await t.oneOrNone(
      `SELECT * FROM ${schema}.journal_entries WHERE id = $1`,
      [entryId],
    );
    if (!entry) throw new Error('Journal entry not found');
    if (entry.status !== 'posted') throw new Error(`Cannot reverse entry with status: ${entry.status}`);

    const lines = await t.manyOrNone(
      `SELECT * FROM ${schema}.journal_entry_lines WHERE entry_id = $1`,
      [entryId],
    );

    // Create correcting entry
    const correcting = await t.one(
      `INSERT INTO ${schema}.journal_entries
       (tenant_id, company_id, project_id, entry_date, description, status, source_type, source_id, corrects_id)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
       RETURNING *`,
      [
        tenantId, entry.company_id, entry.project_id,
        new Date().toISOString().split('T')[0],
        `Reversal of: ${entry.description || entry.id}`,
        entry.source_type, entry.source_id, entryId,
      ],
    );

    // Create reversed lines (swap debit/credit)
    for (const line of lines) {
      await t.none(
        `INSERT INTO ${schema}.journal_entry_lines
         (entry_id, account_id, debit, credit, memo, related_table, related_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          correcting.id, line.account_id,
          parseFloat(line.credit), parseFloat(line.debit),
          `Reversal: ${line.memo || ''}`, line.related_table, line.related_id,
        ],
      );
    }

    // Mark original as reversed
    await t.none(
      `UPDATE ${schema}.journal_entries SET status = 'reversed' WHERE id = $1`,
      [entryId],
    );

    // Create posting queue for correcting entry
    await t.none(
      `INSERT INTO ${schema}.posting_queues (tenant_id, journal_entry_id, status) VALUES ($1, $2, 'pending')`,
      [tenantId, correcting.id],
    );

    logger.info(`Journal entry ${entryId} reversed → correcting entry ${correcting.id}`);
    return correcting;
  });
}

/**
 * Post an AP invoice approval: debit Expense/WIP, credit AP Liability.
 */
async function postAPInvoice(schema, invoice, accounts) {
  const { expenseAccountId, apLiabilityAccountId } = accounts;
  const amount = parseFloat(invoice.total_amount) || 0;
  if (amount <= 0) return null;

  const entry = await createJournalEntry(schema, {
    tenant_id: invoice.tenant_id,
    company_id: invoice.company_id,
    project_id: invoice.project_id,
    entry_date: invoice.invoice_date,
    description: `AP Invoice ${invoice.invoice_number} approved`,
    source_type: 'ap_invoice',
    source_id: invoice.id,
    lines: [
      { account_id: expenseAccountId, debit: amount, credit: 0, memo: 'Expense/WIP', related_table: 'ap_invoices', related_id: invoice.id },
      { account_id: apLiabilityAccountId, debit: 0, credit: amount, memo: 'AP Liability', related_table: 'ap_invoices', related_id: invoice.id },
    ],
  });

  logger.info(`GL entry created for AP Invoice ${invoice.id}: debit Expense, credit AP Liability`);
  return entry;
}

/**
 * Post an AP payment: debit AP Liability, credit Cash/Bank.
 */
async function postAPPayment(schema, payment, accounts) {
  const { apLiabilityAccountId, cashAccountId } = accounts;
  const amount = parseFloat(payment.amount) || 0;
  if (amount <= 0) return null;

  const entry = await createJournalEntry(schema, {
    tenant_id: payment.tenant_id,
    company_id: payment.company_id || accounts.companyId,
    entry_date: payment.payment_date,
    description: `AP Payment ${payment.reference_number || payment.id}`,
    source_type: 'ap_payment',
    source_id: payment.id,
    lines: [
      { account_id: apLiabilityAccountId, debit: amount, credit: 0, memo: 'AP Liability', related_table: 'payments', related_id: payment.id },
      { account_id: cashAccountId, debit: 0, credit: amount, memo: 'Cash/Bank', related_table: 'payments', related_id: payment.id },
    ],
  });

  logger.info(`GL entry created for AP Payment ${payment.id}: debit AP Liability, credit Cash`);
  return entry;
}

/**
 * Post an AR invoice sending: debit AR, credit Revenue.
 */
async function postARInvoice(schema, invoice, accounts) {
  const { arReceivableAccountId, revenueAccountId } = accounts;
  const amount = parseFloat(invoice.total_amount) || 0;
  if (amount <= 0) return null;

  const entry = await createJournalEntry(schema, {
    tenant_id: invoice.tenant_id,
    company_id: invoice.company_id,
    project_id: invoice.project_id,
    entry_date: invoice.invoice_date,
    description: `AR Invoice ${invoice.invoice_number} sent`,
    source_type: 'ar_invoice',
    source_id: invoice.id,
    lines: [
      { account_id: arReceivableAccountId, debit: amount, credit: 0, memo: 'Accounts Receivable', related_table: 'ar_invoices', related_id: invoice.id },
      { account_id: revenueAccountId, debit: 0, credit: amount, memo: 'Revenue', related_table: 'ar_invoices', related_id: invoice.id },
    ],
  });

  logger.info(`GL entry created for AR Invoice ${invoice.id}: debit AR, credit Revenue`);
  return entry;
}

/**
 * Post an AR receipt: debit Cash/Bank, credit AR.
 */
async function postARReceipt(schema, receipt, accounts) {
  const { cashAccountId, arReceivableAccountId } = accounts;
  const amount = parseFloat(receipt.amount) || 0;
  if (amount <= 0) return null;

  const entry = await createJournalEntry(schema, {
    tenant_id: receipt.tenant_id,
    company_id: accounts.companyId,
    entry_date: receipt.receipt_date,
    description: `AR Receipt ${receipt.reference_number || receipt.id}`,
    source_type: 'ar_receipt',
    source_id: receipt.id,
    lines: [
      { account_id: cashAccountId, debit: amount, credit: 0, memo: 'Cash/Bank', related_table: 'receipts', related_id: receipt.id },
      { account_id: arReceivableAccountId, debit: 0, credit: amount, memo: 'Accounts Receivable', related_table: 'receipts', related_id: receipt.id },
    ],
  });

  logger.info(`GL entry created for AR Receipt ${receipt.id}: debit Cash, credit AR`);
  return entry;
}

/**
 * Post an actual cost approval: debit Expense/WIP, credit AP/Accrual.
 */
async function postActualCost(schema, actualCost, accounts) {
  const { expenseAccountId, accrualAccountId } = accounts;
  const amount = parseFloat(actualCost.amount) || 0;
  if (amount <= 0) return null;

  const entry = await createJournalEntry(schema, {
    tenant_id: actualCost.tenant_id || accounts.tenantId,
    company_id: accounts.companyId,
    project_id: actualCost.project_id,
    entry_date: actualCost.incurred_on || new Date().toISOString().split('T')[0],
    description: `Actual cost ${actualCost.reference || actualCost.id} approved`,
    source_type: 'actual_cost',
    source_id: actualCost.id,
    lines: [
      { account_id: expenseAccountId, debit: amount, credit: 0, memo: 'Expense/WIP', related_table: 'actual_costs', related_id: actualCost.id },
      { account_id: accrualAccountId, debit: 0, credit: amount, memo: 'AP/Accrual', related_table: 'actual_costs', related_id: actualCost.id },
    ],
  });

  logger.info(`GL entry created for Actual Cost ${actualCost.id}: debit Expense, credit Accrual`);
  return entry;
}

export {
  createJournalEntry,
  postEntry,
  reverseEntry,
  postAPInvoice,
  postAPPayment,
  postARInvoice,
  postARReceipt,
  postActualCost,
};
