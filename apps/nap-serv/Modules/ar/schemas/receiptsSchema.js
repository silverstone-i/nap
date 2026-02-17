/**
 * @file Schema definition for tenant-scope receipts table
 * @module ar/schemas/receiptsSchema
 *
 * Receipt records against AR invoices. Supports partial payments,
 * method tracking (check/ach/wire), and GL posting hooks.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const receiptsSchema = {
  dbSchema: 'tenantid',
  table: 'receipts',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'client_id', type: 'uuid', notNull: true },
    { name: 'ar_invoice_id', type: 'uuid' },
    { name: 'receipt_date', type: 'date', notNull: true },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'method', type: 'varchar(24)', notNull: true },
    { name: 'reference_number', type: 'varchar(64)' },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['client_id'],
        references: { table: 'ar_clients', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['ar_invoice_id'],
        references: { table: 'ar_invoices', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['client_id'] },
      { type: 'Index', columns: ['ar_invoice_id'] },
      { type: 'Index', columns: ['method'] },
    ],
  },
};

export default receiptsSchema;
