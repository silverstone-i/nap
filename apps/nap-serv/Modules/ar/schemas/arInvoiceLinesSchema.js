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
    { name: 'description', type: 'text' },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'account_id', type: 'uuid', notNull: true },
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
      {
        type: 'ForeignKey',
        columns: ['account_id'],
        references: { table: 'chart_of_accounts', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['invoice_id'] },
      { type: 'Index', columns: ['account_id'] },
    ],
  },
};

export default arInvoiceLinesSchema;
