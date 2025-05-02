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
  table: 'project_activities',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'tenantid.projects', columns: ['id'] },
        onDelete: 'CASCADE'
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'activity_id'],
        references: { table: 'tenantid.activities', columns: ['tenant_id', 'activity_id'] },
        onDelete: 'CASCADE'
      }
    ],
    unique: [['tenant_id', 'project_id', 'activity_id']],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'project_id'] },
      { type: 'Index', columns: ['tenant_id', 'activity_id'] }
    ]
  },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true }
    },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'project_id', type: 'uuid', nullable: false },
    { name: 'activity_id', type: 'varchar(12)', nullable: false }
  ]
};

export default schema;
