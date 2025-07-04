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
  table: 'tasks_master',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: false,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } }, // Used for filtering/partitioning but not for indexing or uniqueness
    { name: 'code', type: 'varchar(50)', notNull: true },
    { name: 'name', type: 'varchar(150)', notNull: true },
    { name: 'description', type: 'text', default: null },
    { name: 'is_active', type: 'boolean', default: true },
    { name: 'task_group_id', type: 'uuid', notNull: true },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['task_group_id'],
        references: {
          table: 'task_groups',
          columns: ['id'],
        },
        onDelete: 'restrict',
      },
    ],
  },
};

export default schema;
