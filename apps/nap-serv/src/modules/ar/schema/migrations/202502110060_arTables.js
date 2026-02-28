/**
 * @file Migration: create AR module tables
 * @module ar/schema/migrations/202502110060_arTables
 *
 * Tables created in FK dependency order:
 *   ar_invoices → ar_invoice_lines
 *   ar_invoices → receipts
 *
 * No ar_clients table — PRD removed it. AR invoices reference the unified
 * clients table from core entities directly.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

const AR_MODELS = ['arInvoices', 'arInvoiceLines', 'receipts'];

export default defineMigration({
  id: '202502110060-ar-tables',
  description: 'Create AR module tables (ar_invoices, ar_invoice_lines, receipts)',

  async up({ schema, models }) {
    if (schema === 'admin') return;

    for (const key of AR_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }
  },

  async down({ schema, models, db }) {
    if (schema === 'admin') return;

    const reversed = [...AR_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
