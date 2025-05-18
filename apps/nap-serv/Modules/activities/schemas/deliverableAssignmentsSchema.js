'use strict';

// unitAssignmentsSchema.js

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
  table: 'deliverable_assignments',
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
      name: 'project_id',
      type: 'uuid',
      nullable: false
    },
    {
      name: 'deliverable_id',
      type: 'uuid',
      nullable: false
    },
    {
      name: 'assigned_code',
      type: 'varchar(20)',
      nullable: true
    },
    {
      name: 'status',
      type: 'varchar(20)',
      default: `'planned'`,
      nullable: false
    },
    {
      name: 'start_date',
      type: 'date',
      nullable: true
    },
    {
      name: 'end_date',
      type: 'date',
      nullable: true
    }
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['project_id', 'deliverable_id']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'tenantid.projects', columns: ['id'] },
        onDelete: 'CASCADE'
      },
      {
        type: 'ForeignKey',
        columns: ['deliverable_id'],
        references: { table: 'tenantid.deliverables', columns: ['id'] },
        onDelete: 'CASCADE'
      }
    ],
    checks: [
      {
        type: 'Check',
        expression: `status IN ('planned', 'released', 'canceled', 'complete')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['project_id'] },
      { type: 'Index', columns: ['unit_id'] },
      { type: 'Index', columns: ['project_id', 'unit_id'] }
    ]
  }
};

export default schema;
