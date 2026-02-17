/**
 * @file Schema definition for tenant-scope catalog_skus table
 * @module bom/schemas/catalogSkusSchema
 *
 * Catalog SKUs are the tenant's canonical item catalog. Each SKU can have
 * a pgvector embedding (3072-dim) generated from the normalized description
 * for AI-powered vendor SKU matching.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const catalogSkusSchema = {
  dbSchema: 'tenantid',
  table: 'catalog_skus',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'sku', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text', notNull: true },
    { name: 'description_normalized', type: 'text' },
    { name: 'category', type: 'varchar(64)' },
    { name: 'unit_of_measure', type: 'varchar(16)' },
    { name: 'embedding', type: 'vector(3072)', colProps: { skip: () => true } },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'sku']],
    indexes: [
      { type: 'Index', columns: ['tenant_id'] },
      { type: 'Index', columns: ['tenant_id', 'sku'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export default catalogSkusSchema;
