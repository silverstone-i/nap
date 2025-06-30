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
  table: 'cost_items',
  version: '0.1.0',
  hasAuditFields: true,
  softDelete: true,

  columns: [
    { name: 'id', type: 'uuid', nullable: false, default: 'gen_random_uuid()', immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', nullable: false, colProps: { skip: c => !c.exists } },
    { name: 'task_id', type: 'uuid', nullable: false },
    { name: 'parent_id', type: 'uuid', nullable: true },
    { name: 'type', type: 'varchar(20)', nullable: false },
    { name: 'description', type: 'text', default: null },
    { name: 'quantity', type: 'numeric', nullable: true },
    { name: 'unit_cost', type: 'numeric', nullable: true },
    { name: 'amount', type: 'numeric', nullable: true },
    { name: 'is_budget', type: 'boolean', default: false },
    { name: 'is_actual', type: 'boolean', default: false },
    { name: 'payable_on_complete', type: 'boolean', default: false },
    { name: 'payment_status', type: 'varchar(50)', default: `'draft'` },
    { name: 'over_budget_reason', type: 'text', default: null },
    { name: 'over_budget_approved_by', type: 'varchar(150)', default: null },
    { name: 'over_budget_approved_at', type: 'timestamptz', default: null },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['task_id'],
        references: {
          table: 'tasks',
          columns: ['id'],
        },
        onDelete: 'cascade',
      },
    ],
    checks: [
      {
        type: 'Check',
        columns: ['type'],
        expression: `type IN ('labor', 'material', 'turnkey')`,
      },
    ],
  },
};

export default schema;
