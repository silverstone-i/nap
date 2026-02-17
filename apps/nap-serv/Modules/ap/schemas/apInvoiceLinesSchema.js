/**
 * @file Schema definition for tenant-scope ap_invoice_lines table
 * @module ap/schemas/apInvoiceLinesSchema
 *
 * Individual line items on AP invoices. Each line references a GL account
 * and optionally links to a cost_line and activity for cost tracking.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const apInvoiceLinesSchema = {
  dbSchema: 'tenantid',
  table: 'ap_invoice_lines',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'invoice_id', type: 'uuid', notNull: true },
    { name: 'line_number', type: 'integer', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'account_id', type: 'uuid', notNull: true },
    { name: 'cost_line_id', type: 'uuid' },
    { name: 'activity_id', type: 'uuid' },
    { name: 'quantity', type: 'numeric(12,4)', notNull: true, default: 1 },
    { name: 'unit_price', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'amount', type: 'numeric(12,2)', generated: { expression: 'quantity * unit_price', mode: 'stored' } },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['invoice_id'],
        references: { table: 'ap_invoices', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['cost_line_id'],
        references: { table: 'cost_lines', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'activities', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['invoice_id'] },
      { type: 'Index', columns: ['account_id'] },
      { type: 'Index', columns: ['cost_line_id'] },
      { type: 'Index', columns: ['activity_id'] },
    ],
  },
};

export default apInvoiceLinesSchema;
