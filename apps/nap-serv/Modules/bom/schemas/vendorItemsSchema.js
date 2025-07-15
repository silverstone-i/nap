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

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'vendor_items',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_item_code', type: 'varchar(100)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'embedding', type: 'vector(1536)', default: null },
    { name: 'catalog_item_id', type: 'uuid', default: null },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['vendor_id', 'vendor_item_code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: {
          table: 'vendors',
          columns: ['id'],
        },
        onDelete: 'restrict',
      },
      {
        type: 'ForeignKey',
        columns: ['catalog_item_id'],
        references: {
          table: 'catalog_items',
          columns: ['id'],
        },
        onDelete: 'set null',
      },
    ],
    indexes: [
      {
        type: 'Index',
        columns: ['catalog_item_id'],
      },
    ],
  },
};

export default schema;