/**
 * @file Schema definition for tenant-scope deliverable_assignments table
 * @module activities/schemas/deliverableAssignmentsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const deliverableAssignmentsSchema = {
  dbSchema: 'tenantid',
  table: 'deliverable_assignments',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'deliverable_id', type: 'uuid', notNull: true },
    { name: 'project_id', type: 'uuid', notNull: true },
    { name: 'employee_id', type: 'uuid' },
    { name: 'notes', type: 'text' },
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
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['deliverable_id'] },
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['employee_id'] },
    ],
  },
};

export default deliverableAssignmentsSchema;
