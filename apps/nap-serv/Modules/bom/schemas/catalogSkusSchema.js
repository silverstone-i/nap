// @ts-check
import z from 'zod';
/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'catalog_skus',
  hasAuditFields: true,
  softDelete: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'catalog_sku', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text', notNull: true },
    { name: 'description_normalized', type: 'text', notNull: true },
    { name: 'category', type: 'varchar(64)', notNull: false },
    { name: 'sub_category', type: 'varchar(64)', notNull: false },
    { name: 'model', type: 'varchar(32)', notNull: false },
    { name: 'embedding', type: 'vector(1536)', notNull: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['catalog_sku']],
    indexes: [
      { type: 'Index', columns: ['catalog_sku'] },
      { type: 'Index', columns: ['category'] },
      { type: 'Index', columns: ['sub_category'] },
    ],
  },
};

export default schema;
