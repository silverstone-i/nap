/**
 * @file Schema definition for tenant-scope vendor_skus table
 * @module bom/schemas/vendorSkusSchema
 *
 * Vendor SKUs represent items as described by vendors. Each vendor SKU can be
 * linked to a catalog_sku via AI matching with a confidence score. The embedding
 * column (3072-dim pgvector) powers cosine similarity search.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const vendorSkusSchema = {
  dbSchema: 'tenantid',
  table: 'vendor_skus',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_sku', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text', notNull: true },
    { name: 'description_normalized', type: 'text' },
    { name: 'catalog_sku_id', type: 'uuid' },
    { name: 'confidence', type: 'real' },
    { name: 'embedding', type: 'vector(3072)', colProps: { skip: () => true } },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['catalog_sku_id'],
        references: { table: 'catalog_skus', columns: ['id'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['vendor_id', 'vendor_sku'] },
      { type: 'Index', columns: ['catalog_sku_id'] },
    ],
  },
};

export default vendorSkusSchema;
