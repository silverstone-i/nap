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
  table: 'embeddings',
  version: '1.0.0',
  hasAuditFields: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'item_id', type: 'uuid', notNull: true },
    { name: 'source', type: 'varchar(20)', notNull: true },
    { name: 'embedding', type: 'vector(1536)', notNull: true },
    { name: 'model', type: 'varchar(100)', default: `'openai-text-embedding-3-small'` },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['item_id', 'source', 'model']],
  },
};

export default schema;
