/**
 * @file Schema definition for tenant-scope cost_lines table
 * @module activities/schemas/costLinesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const costLinesSchema = {
  dbSchema: 'tenantid',
  table: 'cost_lines',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'company_id', type: 'uuid', notNull: true },
    { name: 'deliverable_id', type: 'uuid', notNull: true },
    { name: 'vendor_id', type: 'uuid' },
    { name: 'activity_id', type: 'uuid', notNull: true },
    { name: 'budget_id', type: 'uuid' },
    { name: 'tenant_sku', type: 'varchar(64)' },
    { name: 'source_type', type: 'varchar(16)', notNull: true },
    { name: 'quantity', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'unit_price', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'amount', type: 'numeric(12,2)', generated: { expression: 'quantity * unit_price', mode: 'stored' } },
    { name: 'markup_pct', type: 'numeric(5,2)', default: 0 },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'draft' },
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
        columns: ['deliverable_id'],
        references: { table: 'deliverables', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'activities', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['budget_id'],
        references: { table: 'budgets', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['company_id'] },
      { type: 'Index', columns: ['deliverable_id'] },
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['activity_id'] },
      { type: 'Index', columns: ['budget_id'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default costLinesSchema;
