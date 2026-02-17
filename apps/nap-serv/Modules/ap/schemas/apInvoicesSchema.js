/**
 * @file Schema definition for tenant-scope ap_invoices table
 * @module ap/schemas/apInvoicesSchema
 *
 * Vendor invoices with status workflow: open → approved → paid → voided.
 * Links to inter_companies, vendors, and optionally projects for cashflow tracking.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const apInvoicesSchema = {
  dbSchema: 'tenantid',
  table: 'ap_invoices',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'company_id', type: 'uuid', notNull: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'project_id', type: 'uuid' },
    { name: 'invoice_number', type: 'varchar(64)', notNull: true },
    { name: 'invoice_date', type: 'date', notNull: true },
    { name: 'due_date', type: 'date' },
    { name: 'total_amount', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'balance_due', type: 'numeric(14,2)', notNull: true, default: 0 },
    { name: 'currency', type: 'varchar(3)', notNull: true, default: 'USD' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'open' },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['company_id'],
        references: { table: 'inter_companies', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default apInvoicesSchema;
