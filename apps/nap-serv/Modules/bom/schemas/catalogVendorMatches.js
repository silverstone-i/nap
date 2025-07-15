

// @ts-check

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */
const schema = {
  dbSchema: 'tenantid',
  table: 'catalog_vendor_matches',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: false,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'catalog_item_id', type: 'uuid', notNull: true },
    { name: 'vendor_item_id', type: 'uuid', notNull: true },
    { name: 'score', type: 'numeric(5,4)', notNull: true },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['catalog_item_id', 'vendor_item_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['catalog_item_id'],
        references: { table: 'catalog_items', columns: ['id'] },
        onDelete: 'cascade',
      },
      {
        type: 'ForeignKey',
        columns: ['vendor_item_id'],
        references: { table: 'vendor_items', columns: ['id'] },
        onDelete: 'cascade',
      },
    ],
  },
};

export default schema;