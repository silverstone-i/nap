

'use strict';

const schema = {
  dbSchema: 'tenantid',
  table: 'sub_project_budgets',
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
      type: 'numeric(12,2)',
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
      name: 'source_budget_id',
      type: 'uuid',
      nullable: true
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
    unique: [['tenant_id', 'sub_project_id', 'activity_id']],
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
        expression: `status IN ('draft', 'submitted', 'approved', 'locked', 'rejected')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['sub_project_id'] },
      { type: 'Index', columns: ['activity_id'] }
    ]
  }
};

export default schema;