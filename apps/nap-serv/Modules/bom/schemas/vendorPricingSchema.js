/**
 * @file Schema definition for tenant-scope vendor_pricing table
 * @module bom/schemas/vendorPricingSchema
 *
 * Time-based vendor pricing keyed by vendor_sku_id and effective_date.
 * Supports historical price tracking and current price lookup.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const vendorPricingSchema = {
  dbSchema: 'tenantid',
  table: 'vendor_pricing',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'vendor_sku_id', type: 'uuid', notNull: true },
    { name: 'unit_price', type: 'numeric(12,4)', notNull: true, default: 0 },
    { name: 'currency', type: 'varchar(3)', notNull: true, default: 'USD' },
    { name: 'effective_date', type: 'date', notNull: true },
    { name: 'expiry_date', type: 'date' },
    { name: 'min_quantity', type: 'numeric(12,4)', default: 0 },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_sku_id'],
        references: { table: 'vendor_skus', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_sku_id'] },
      { type: 'Index', columns: ['vendor_sku_id', 'effective_date'] },
    ],
  },
};

export default vendorPricingSchema;
