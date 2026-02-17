/**
 * @file Schema definition for tenant-scope activities table
 * @module activities/schemas/activitiesSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const activitiesSchema = {
  dbSchema: 'tenantid',
  table: 'activities',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'category_id', type: 'uuid', notNull: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['category_id'],
        references: { table: 'categories', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'code'], unique: true, where: 'deactivated_at IS NULL' },
      { type: 'Index', columns: ['category_id'] },
    ],
  },
};

export default activitiesSchema;
