'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const schema = {
  dbSchema: 'tenantid',
  table: 'actual_costs',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true }
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      nullable: false,
      colProps: { cnd: true }
    },
    {
      name: 'cost_line_id',
      type: 'uuid',
      nullable: false
    },
    {
      name: 'amount',
      type: 'numeric(12,2)',
      nullable: false
    },
    {
      name: 'currency',
      type: 'varchar(3)',
      nullable: false
    },
    {
      name: 'reference',
      type: 'text',
      nullable: true
    },
    {
      name: 'approval_status',
      type: 'varchar(20)',
      default: `'pending'`,
      nullable: false
    },
    {
      name: 'approved_by',
      type: 'uuid',
      nullable: true
    },
    {
      name: 'approval_note',
      type: 'text',
      nullable: true
    },
    {
      name: 'incurred_on',
      type: 'date',
      nullable: false
    }
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cost_line_id'],
        references: { table: 'tenantid.costlines', columns: ['id'] },
        onDelete: 'CASCADE'
      }
    ],
    checks: [
      {
        type: 'Check',
        expression: `approval_status IN ('pending', 'approved', 'rejected')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'cost_line_id'] },
      { type: 'Index', columns: ['incurred_on'] }
    ]
  }
};

export default schema;
