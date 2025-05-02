

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
  table: 'project_unit_budgets',
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
      name: 'project_unit_id',
      type: 'uuid',
      nullable: false
    },
    {
      name: 'activity_id',
      type: 'uuid',
      nullable: false
    },
    {
      name: 'budgeted_amount',
      type: 'numeric',
      nullable: false
    },
    {
      name: 'unit',
      type: 'varchar(20)',
      nullable: true
    },
    {
      name: 'quantity',
      type: 'numeric',
      nullable: true
    },
    {
      name: 'version',
      type: 'integer',
      default: 1,
      nullable: false
    },
    {
      name: 'is_current',
      type: 'boolean',
      default: true,
      nullable: false
    },
    {
      name: 'status',
      type: 'varchar(20)',
      default: `'draft'`,
      nullable: false
    }
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'project_unit_id', 'activity_id', 'version']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_unit_id'],
        references: { table: 'tenantid.project_units', columns: ['id'] },
        onDelete: 'CASCADE'
      },
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'tenantid.activities', columns: ['id'] },
        onDelete: 'CASCADE'
      }
    ],
    checks: [
      {
        type: 'Check',
        expression: 'version > 0'
      },
      {
        type: 'Check',
        expression: `status IN ('draft', 'approved', 'rejected')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'project_unit_id'] },
      { type: 'Index', columns: ['activity_id'] }
    ]
  }
};

export default schema;