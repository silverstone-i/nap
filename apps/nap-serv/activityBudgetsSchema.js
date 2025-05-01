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
  table: 'activity_budgets',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'tenantid.activities', columns: ['activity_id'] },
        onDelete: 'CASCADE',
      },
    ],
    unique: [['tenant_id', 'activity_id']],
    indexes: [{ type: 'Index', columns: ['tenant_id', 'activity_id'] }],
  },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'activity_id', type: 'varchar', length: 12, nullable: false },

    // Budgeted inputs
    { name: 'budgeted_cost', type: 'numeric(14,2)', nullable: true },
    { name: 'budgeted_quantity', type: 'numeric(10,2)', nullable: true },
    { name: 'budgeted_price', type: 'numeric(14,2)', nullable: true },
    { name: 'notes', type: 'text', nullable: true },
  ],
};

export default schema;
