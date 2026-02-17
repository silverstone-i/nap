/**
 * @file Schema definition for tenant-scope template_units table
 * @module projects/schemas/templateUnitsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const templateUnitsSchema = {
  dbSchema: 'tenantid',
  table: 'template_units',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'version', type: 'integer', notNull: true, default: 1 },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'draft' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
    ],
  },
};

export default templateUnitsSchema;
