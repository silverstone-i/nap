/**
 * @file Schema definition for tenant-scope budgets table
 * @module activities/schemas/budgetsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const budgetsSchema = {
  dbSchema: 'tenantid',
  table: 'budgets',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'deliverable_id', type: 'uuid', notNull: true },
    { name: 'activity_id', type: 'uuid', notNull: true },
    { name: 'budgeted_amount', type: 'numeric(12,2)', notNull: true, default: 0 },
    { name: 'version', type: 'integer', notNull: true, default: 1 },
    { name: 'is_current', type: 'boolean', notNull: true, default: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'draft' },
    { name: 'submitted_by', type: 'uuid' },
    { name: 'submitted_at', type: 'timestamptz' },
    { name: 'approved_by', type: 'uuid' },
    { name: 'approved_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['deliverable_id'],
        references: { table: 'deliverables', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'activities', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['deliverable_id'] },
      { type: 'Index', columns: ['activity_id'] },
      { type: 'Index', columns: ['deliverable_id', 'activity_id', 'version'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default budgetsSchema;
