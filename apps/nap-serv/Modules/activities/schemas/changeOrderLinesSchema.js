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
  table: 'change_order_lines',
  hasAuditFields: true,
  softDelete: true,
  version: '1.0.0',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true },
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      nullable: false,
      colProps: { cnd: true },
    },
    {
      name: 'deliverable_id',
      type: 'uuid',
      nullable: false,
    },
    {
      name: 'activity_id',
      type: 'uuid',
      nullable: false,
    },
    {
      name: 'reason',
      type: 'text',
      nullable: true,
    },
    {
      name: 'change_amount',
      type: 'numeric(12,2)',
      nullable: false,
    },
    {
      name: 'currency',
      type: 'varchar(3)',
      nullable: false,
    },
    {
      name: 'reference',
      type: 'text',
      nullable: true,
    },
    {
      name: 'status',
      type: 'varchar(20)',
      default: `'pending'`,
      nullable: false,
    },
    {
      name: 'approved_by',
      type: 'varchar(20)',
      nullable: true,
    },
    {
      name: 'approved_at',
      type: 'timestamptz',
      default: 'now()',
      nullable: true,
    },
    {
      name: 'approval_note',
      type: 'text',
      nullable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    // unique: [['tenant_id', 'deliverable_id', 'activity_id', 'reference']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['deliverable_id'],
        references: { table: 'deliverables', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'activities', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    checks: [
      {
        type: 'Check',
        expression: `status IN ('pending', 'approved', 'locked', 'rejected')`,
      },
    ],
    indexes: [
      { type: 'Index', columns: ['deliverable_id', 'activity_id', 'reference'] },
      { type: 'Index', columns: ['status'] },
    ],
  },
};

export default schema;
