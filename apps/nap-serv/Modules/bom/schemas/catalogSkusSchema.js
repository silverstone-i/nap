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
  table: 'catalog_items',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'catalog_item_code', type: 'varchar(200)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'embedding', type: 'vector(1536)', default: null },
    { name: 'vendor_item_id', type: 'uuid', default: null },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_item_id'],
        references: {
          table: 'vendor_items',
          columns: ['id'],
        },
        onDelete: 'set null',
      }
    ],
    indexes: [
      {
        type: 'Index',
        columns: ['vendor_item_id'],
      },
    ],
  },
};

export default schema;