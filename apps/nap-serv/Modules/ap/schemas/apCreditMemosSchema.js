/**
 * @file Schema definition for tenant-scope ap_credit_memos table
 * @module ap/schemas/apCreditMemosSchema
 *
 * Credit memos against vendors, optionally linked to a specific AP invoice.
 * Status workflow: open → applied → voided.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const apCreditMemosSchema = {
  dbSchema: 'tenantid',
  table: 'ap_credit_memos',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'ap_invoice_id', type: 'uuid' },
    { name: 'memo_number', type: 'varchar(64)', notNull: true },
    { name: 'memo_date', type: 'date', notNull: true },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'reason', type: 'text' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'open' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['ap_invoice_id'],
        references: { table: 'ap_invoices', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['ap_invoice_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default apCreditMemosSchema;
