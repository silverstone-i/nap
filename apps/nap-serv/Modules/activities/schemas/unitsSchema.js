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
  table: 'units',
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
      name: 'unit_code',
      type: 'varchar(20)',
      nullable: false
    },
    {
      name: 'description',
      type: 'text',
      nullable: true
    },
    {
      name: 'status',
      type: 'varchar(20)',
      default: `'pending'`,
      nullable: false
    }
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'unit_code']],
    checks: [
      {
        type: 'Check',
        expression: `status IN ('pending', 'released', 'finished', 'canceled')`
      }
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'unit_code'] }
    ]
  }
};

export default schema;