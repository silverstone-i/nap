// @ts-check
import z from 'zod';
/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'vendor_skus',
  hasAuditFields: true,
  softDelete: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_sku', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text', notNull: true },
    { name: 'description_normalized', type: 'text', notNull: true },
    { name: 'catalog_sku_id', type: 'uuid', notNull: false },
    { name: 'model', type: 'varchar(32)', notNull: false },
    { name: 'embedding', type: 'vector(1536)', notNull: false },
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
    unique: [['vendor_id', 'vendor_sku']],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['vendor_sku'] },
    ],
  },
};

export default schema;
