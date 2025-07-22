// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/**
 * Catalog SKUs table schema
 * Holds master catalog SKUs for products/services
 * @type {TableSchema}
 */
const catalogSkusSchema = {
  dbSchema: 'tenantid',
  table: 'catalog_skus',
  hasAuditFields: true,
  version: '1.0.0',
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'sku', type: 'varchar(32)', notNull: true },
    { name: 'description', type: 'varchar(512)' },
    { name: 'category', type: 'varchar(64)' },
    { name: 'sub_category', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['sku_code']],
    indexes: [
      { type: 'Index', columns: ['sku_code'] },
      { type: 'Index', columns: ['name'] },
    ],
  },
};

export default catalogSkusSchema;
