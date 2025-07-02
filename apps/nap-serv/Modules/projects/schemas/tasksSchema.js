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
  table: 'tasks',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } },
    { name: 'unit_id', type: 'uuid', notNull: true },
    { name: 'task_master_id', type: 'uuid' },
    { name: 'parent_task_id', type: 'uuid' },
    { name: 'name', type: 'varchar(150)', notNull: true },
    { name: 'description', type: 'text', default: null },
    { name: 'status', type: 'varchar(50)', default: `'pending'` },
    { name: 'start_date', type: 'date' },
    { name: 'end_date', type: 'date' },
    { name: 'is_milestone', type: 'boolean', default: false },
    { name: 'milestone_type', type: 'varchar(50)' },
    { name: 'payable_on_complete', type: 'boolean', default: false },
    { name: 'gantt_order', type: 'integer' },
    { name: 'duration_days', type: 'integer' },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['unit_id'],
        references: {
          table: 'units',
          columns: ['id'],
        },
        onDelete: 'cascade',
      },
    ],
  },
};

export default schema;
