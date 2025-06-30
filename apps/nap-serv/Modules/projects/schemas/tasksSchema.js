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
    { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', nullable: false, colProps: { skip: c => !c.exists } },
    { name: 'unit_id', type: 'uuid', nullable: false },
    { name: 'task_master_id', type: 'uuid', nullable: true },
    { name: 'parent_task_id', type: 'uuid', nullable: true },
    { name: 'name', type: 'varchar(150)', nullable: false },
    { name: 'description', type: 'text', default: null },
    { name: 'status', type: 'varchar(50)', default: `'pending'` },
    { name: 'start_date', type: 'date', nullable: true },
    { name: 'end_date', type: 'date', nullable: true },
    { name: 'is_milestone', type: 'boolean', default: false },
    { name: 'milestone_type', type: 'varchar(50)', nullable: true },
    { name: 'payable_on_complete', type: 'boolean', default: false },
    { name: 'gantt_order', type: 'integer', nullable: true },
    { name: 'duration_days', type: 'integer', nullable: true },
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
