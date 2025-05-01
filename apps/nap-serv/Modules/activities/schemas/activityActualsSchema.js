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
  table: 'activity_actuals',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'activity_id'],
        references: { table: 'tenantid.activities', columns: ['tenant_id', 'activity_id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['tenant_id', 'activity_id'] },
      { type: 'Index', columns: ['source_type'] },
    ],
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
    { name: 'activity_id', type: 'varchar(12)', nullable: false },

    // Source tracking
    { name: 'source_type', type: 'varchar(32)', nullable: false }, // e.g. 'material', 'labor'
    { name: 'source_ref', type: 'uuid', nullable: true }, // nullable FK reference (e.g. vendor_part_id or employee_id)

    // Quantity tracking
    { name: 'unit', type: 'varchar(16)', nullable: false },
    { name: 'quantity', type: 'numeric(12,4)', nullable: false },
    { name: 'unit_cost', type: 'numeric(12,4)', nullable: false },

    { name: 'notes', type: 'text', nullable: true },
  ],
};

export default schema;
