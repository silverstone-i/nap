/**
 * @file Schema definition for tenant-scope ar_invoices table
 * @module ar/schemas/arInvoicesSchema
 *
 * Client invoices with status workflow: open → sent → paid → voided.
 * Links to inter_companies, ar_clients, and optionally projects/deliverables
 * for revenue and profitability tracking.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const arInvoicesSchema = {
  dbSchema: 'tenantid',
  table: 'ar_invoices',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'company_id', type: 'uuid', notNull: true },
    { name: 'client_id', type: 'uuid', notNull: true },
    { name: 'project_id', type: 'uuid' },
    { name: 'deliverable_id', type: 'uuid' },
    { name: 'invoice_number', type: 'varchar(32)', notNull: true },
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
        columns: ['client_id'],
        references: { table: 'ar_clients', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['deliverable_id'],
        references: { table: 'deliverables', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['client_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['deliverable_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default arInvoicesSchema;
