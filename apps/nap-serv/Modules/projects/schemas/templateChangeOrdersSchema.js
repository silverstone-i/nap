/**
 * @file Schema definition for tenant-scope template_change_orders table
 * @module projects/schemas/templateChangeOrdersSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const templateChangeOrdersSchema = {
  dbSchema: 'tenantid',
  table: 'template_change_orders',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'template_unit_id', type: 'uuid', notNull: true },
    { name: 'co_number', type: 'varchar(16)', notNull: true },
    { name: 'title', type: 'varchar(128)', notNull: true },
    { name: 'reason', type: 'text' },
    { name: 'total_amount', type: 'numeric(12,2)', default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['template_unit_id'],
        references: { table: 'template_units', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['template_unit_id'] },
    ],
  },
};

export default templateChangeOrdersSchema;
