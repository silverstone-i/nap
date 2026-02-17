/**
 * @file Schema definition for tenant-scope vendor_parts table
 * @module activities/schemas/vendorPartsSchema
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const vendorPartsSchema = {
  dbSchema: 'tenantid',
  table: 'vendor_parts',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_sku', type: 'varchar(64)', notNull: true },
    { name: 'tenant_sku', type: 'varchar(64)' },
    { name: 'unit_cost', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'currency', type: 'varchar(3)', notNull: true, default: 'USD' },
    { name: 'markup_pct', type: 'numeric(5,2)', default: 0 },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['vendor_sku'] },
      { type: 'Index', columns: ['tenant_sku'] },
    ],
  },
};

export default vendorPartsSchema;
