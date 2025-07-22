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
  table: 'tasks',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', notNull: true, default: 'uuidv7()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true, colProps: { skip: c => !c.exists } },
    { name: 'unit_id', type: 'uuid', notNull: true },
    { name: 'template_id', type: 'uuid' },
    { name: 'task_code', type: 'varchar(50)', notNull: true, colProps: { validator: z.coerce.string() } },
    { name: 'name', type: 'varchar(150)', notNull: true },
    { name: 'duration_days', type: 'integer' },
    { name: 'start_date', type: 'date' },
    { name: 'status', type: 'varchar(50)', default: `'pending'` },
    { name: 'end_date', type: 'date' },
    { name: 'gantt_order', type: 'integer' },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [{ type: 'ForeignKey', columns: ['unit_id'], references: { table: 'units', columns: ['id'] }, onDelete: 'cascade' }],
    checks: [{ type: 'Check', columns: ['status'], expression: `status IN ('pending', 'started', 'complete')` }],
  },
};

export default schema;
