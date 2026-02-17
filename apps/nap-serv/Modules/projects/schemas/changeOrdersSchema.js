/**
 * @file Schema definition for tenant-scope change_orders table
 * @module projects/schemas/changeOrdersSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const changeOrdersSchema = {
  dbSchema: 'tenantid',
  table: 'change_orders',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'unit_id', type: 'uuid', notNull: true },
    { name: 'co_number', type: 'varchar(16)', notNull: true },
    { name: 'title', type: 'varchar(128)', notNull: true },
    { name: 'reason', type: 'text' },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'draft' },
    { name: 'total_amount', type: 'numeric(12,2)', default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['unit_id'],
        references: { table: 'units', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['unit_id'] },
    ],
  },
};

export default changeOrdersSchema;
