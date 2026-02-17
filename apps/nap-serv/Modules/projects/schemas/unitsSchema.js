/**
 * @file Schema definition for tenant-scope units table
 * @module projects/schemas/unitsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const unitsSchema = {
  dbSchema: 'tenantid',
  table: 'units',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'project_id', type: 'uuid', notNull: true },
    { name: 'template_unit_id', type: 'uuid' },
    { name: 'version_used', type: 'integer' },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'unit_code', type: 'varchar(32)', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'draft' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['project_id', 'unit_code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'projects', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['template_unit_id'],
        references: { table: 'template_units', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['template_unit_id'] },
    ],
  },
};

export default unitsSchema;
