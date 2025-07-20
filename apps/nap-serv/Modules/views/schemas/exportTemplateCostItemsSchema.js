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
  table: 'vw_export_template_cost_items',
  version: '0.1.0',
  columns: [
    { name: 'unit_name', type: 'varchar(150)', notNull: true },
    { name: 'version', type: 'integer', notNull: true },
    { name: 'task_code', type: 'varchar(50)', notNull: true },
    { name: 'parent_code', type: 'varchar(50)', default: null },
    { name: 'item_code', type: 'varchar(50)', default: null },
    { name: 'cost_class', type: 'varchar(20)', notNull: true },
    { name: 'cost_source', type: 'varchar(20)', notNull: true },
    { name: 'description', type: 'text', notNull: true },
    { name: 'quantity', type: 'numeric', default: 1 },
    { name: 'unit_cost', type: 'numeric' },
  ],
};

export default schema;
