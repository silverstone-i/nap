'use strict';

// unitBudgetsSchema.js

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
  table: 'templates',
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
      name: 'sub_project_id',
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
      name: 'sub_project',
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
    },
    {
      name: 'submitted_by',
      type: 'varchar(64)',
      nullable: true
    },
    {
      name: 'submitted_at',
      type: 'timestamptz',
      nullable: true
    },
    {
      name: 'approved_by',
      type: 'varchar(64)',
      nullable: true
    },
    {
      name: 'approved_at',
      type: 'timestamptz',
      nullable: true
    }
  ],
  constraints: {
    primaryKey: ['id'],
    // unique: [['tenant_id', 'sub_project_id', 'activity_id', 'version']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['sub_project_id'],
        references: { table: 'tenantid.sub_projects', columns: ['id'] },
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
        expression: `status IN ('draft', 'submitted', 'approved', 'locked', 'rejected')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['sub_project_id'] },
      { type: 'Index', columns: ['activity_id'] },
      { type: 'Index', columns: ['activity_id', 'version'] }
    ]
  }
};

export default schema;