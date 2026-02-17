/**
 * @file Migration: create AP module tables
 * @module ap/schema/migrations/202502110050_apTables
 *
 * Tables created in FK dependency order:
 *   ap_invoices → ap_invoice_lines
 *   ap_invoices → payments
 *   ap_invoices → ap_credit_memos
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

const AP_MODELS = ['apInvoices', 'apInvoiceLines', 'payments', 'apCreditMemos'];

export default defineMigration({
  id: '202502110050-ap-tables',
  description: 'Create AP module tables (ap_invoices, ap_invoice_lines, payments, ap_credit_memos)',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    // Create tables in FK order
    for (const key of AP_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models, db }) {
    if (schema === 'admin') return;

    // Drop tables in reverse FK order
    const reversed = [...AP_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
