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
import z from 'zod';

const schema = {
  dbSchema: 'tenantid',
  table: 'template_tasks',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, immutable: true, default: 'uuidv7()' },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } },
    { name: 'template_id', type: 'uuid', notNull: true },
    { name: 'task_code', type: 'varchar(50)', notNull: true, colProps: { validator: z.coerce.string() } },
    { name: 'name', type: 'varchar(150)', notNull: true },
    { name: 'description', type: 'text', default: null },
    { name: 'duration_days', type: 'integer', default: 0 },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      { type: 'ForeignKey', columns: ['template_id'], references: { table: 'template_units', columns: ['id'] }, onDelete: 'cascade' },
      { type: 'ForeignKey', columns: ['task_code'], references: { table: 'tasks_master', columns: ['code'] }, onDelete: 'restrict' },
    ],
  },
};

export default schema;
