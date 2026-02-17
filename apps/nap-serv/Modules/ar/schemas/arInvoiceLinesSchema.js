/**
 * @file Schema definition for tenant-scope ar_invoice_lines table
 * @module ar/schemas/arInvoiceLinesSchema
 *
 * Individual line items on AR invoices. Each line references a GL account
 * for revenue recognition.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const arInvoiceLinesSchema = {
  dbSchema: 'tenantid',
  table: 'ar_invoice_lines',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'invoice_id', type: 'uuid', notNull: true },
    { name: 'line_number', type: 'integer', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'account_id', type: 'uuid', notNull: true },
    { name: 'quantity', type: 'numeric(12,4)', notNull: true, default: 1 },
    { name: 'unit_price', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'amount', type: 'numeric(14,2)', generated: { expression: 'quantity * unit_price', mode: 'stored' } },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['invoice_id'],
        references: { table: 'ar_invoices', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['invoice_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
  },
};

export default arInvoiceLinesSchema;
