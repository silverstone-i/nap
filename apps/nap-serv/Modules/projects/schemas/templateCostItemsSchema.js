'use strict';
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
  table: 'template_cost_items',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true, default: 'uuidv7()' },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } },
    { name: 'template_task_id', type: 'uuid', notNull: true },
    { name: 'parent_code', type: 'varchar(50)', default: null },
    { name: 'item_code', type: 'varchar(50)', default: null },
    { name: 'cost_class', type: 'varchar(20)', notNull: true },
    { name: 'cost_source', type: 'varchar(20)', notNull: true, default: `'turnkey'` },
    { name: 'description', type: 'text', notNull: true },
    { name: 'quantity', type: 'numeric', default: 1 },
    { name: 'unit_cost', type: 'numeric' },
    { name: 'amount', type: 'numeric(12,2)', generated: 'always', expression: '(quantity * unit_cost)', stored: true },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { type: 'ForeignKey', columns: ['template_task_id'], references: { table: 'template_tasks', columns: ['id'] }, onDelete: 'cascade' },
    ],
    checks: [
      { type: 'Check', columns: ['cost_class'], expression: `cost_class IN ('labor', 'material')` },
      { type: 'Check', columns: ['cost_source'], expression: `cost_source IN ('turnkey', 'bom')` },
    ],
  },
};

export default schema;
