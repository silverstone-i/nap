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
  table: 'vw_template_tasks_export',
  version: '1.0.0',
  columns: [
    { name: 'unit_name', type: 'varchar(150)', notNull: true },
    { name: 'version', type: 'integer', notNull: true },
    { name: 'task_code', type: 'varchar(50)', notNull: true },
    { name: 'name', type: 'varchar(150)', notNull: true },
    { name: 'duration_days', type: 'integer', default: 0 },
  ],
};

export default schema;
