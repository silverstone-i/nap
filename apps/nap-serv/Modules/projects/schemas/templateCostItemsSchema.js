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
    {
      name: 'id',
      type: 'uuid',
      nullable: false,
      immutable: true,
      default: 'gen_random_uuid()',
    },
    {
      name: 'tenant_code',
      type: 'varchar(6)',
      nullable: false,
      colProps: { skip: c => !c.exists },
    },
    {
      name: 'template_task_id',
      type: 'uuid',
      nullable: false,
    },
    {
      name: 'parent_id',
      type: 'uuid',
      nullable: true,
    },
    {
      name: 'type',
      type: 'varchar(20)',
      nullable: false,
    },
    {
      name: 'description',
      type: 'text',
      default: null,
    },
    {
      name: 'quantity',
      type: 'numeric',
      nullable: true,
    },
    {
      name: 'unit_cost',
      type: 'numeric',
      nullable: true,
    },
    {
      name: 'amount',
      type: 'numeric',
      nullable: true,
    },
  ],

  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['template_task_id'],
        references: {
          table: 'template_tasks',
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
