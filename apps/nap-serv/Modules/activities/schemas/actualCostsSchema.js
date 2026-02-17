/**
 * @file Schema definition for tenant-scope actual_costs table
 * @module activities/schemas/actualCostsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const actualCostsSchema = {
  dbSchema: 'tenantid',
  table: 'actual_costs',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'activity_id', type: 'uuid', notNull: true },
    { name: 'project_id', type: 'uuid' },
    { name: 'amount', type: 'numeric(12,2)', notNull: true, default: 0 },
    { name: 'currency', type: 'varchar(3)', notNull: true, default: 'USD' },
    { name: 'reference', type: 'text' },
    { name: 'approval_status', type: 'varchar(20)', notNull: true, default: 'pending' },
    { name: 'incurred_on', type: 'date' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'activities', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['activity_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['approval_status'] },
      { type: 'Index', columns: ['incurred_on'] },
    ],
  },
};

export default actualCostsSchema;
