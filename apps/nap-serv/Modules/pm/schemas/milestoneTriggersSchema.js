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
  table: 'milestone_triggers',
  version: '0.1.0',
  columns: [
    { name: 'id', type: 'varchar(50)', notNull: true },
    { name: 'description', type: 'text', default: null },
    { name: 'action_handler', type: 'varchar(100)', default: null }, // Optional pointer to future logic or function
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

export default schema;
