/**
 * @file Schema definition for tenant-scope payments table
 * @module ap/schemas/paymentsSchema
 *
 * Payment records against AP invoices. Supports partial payments,
 * method tracking (check/ach/wire), and GL posting hooks.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const paymentsSchema = {
  dbSchema: 'tenantid',
  table: 'payments',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'ap_invoice_id', type: 'uuid' },
    { name: 'payment_date', type: 'date', notNull: true },
    { name: 'amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'method', type: 'varchar(16)', notNull: true },
    { name: 'reference_number', type: 'varchar(64)' },
    { name: 'notes', type: 'text' },
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
      { type: 'Index', columns: ['method'] },
    ],
  },
};

export default paymentsSchema;
