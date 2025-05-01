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
  table: 'costlines',
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
      {
        type: 'ForeignKey',
        columns: ['tenant_sku'],
        references: { table: 'tenantid.vendor_parts', columns: ['tenant_sku'] },
        onDelete: 'SET NULL',
      },
    ],
    indexes: [
      {
        type: 'Index',
        columns: ['tenant_id', 'activity_id'],
      },
      {
        type: 'Index',
        columns: ['assembly_code'],
      },
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
    { name: 'tenant_id', type: 'varchar', length: 8, nullable: false },
    { name: 'activity_id', type: 'varchar', length: 12, nullable: false },
    { name: 'tenant_sku', type: 'varchar', length: 64, nullable: true },
    { name: 'quantity', type: 'numeric(12,4)', nullable: false },
    { name: 'markup_pct', type: 'numeric(5,2)', nullable: true },
    { name: 'assembly_code', type: 'varchar', length: 16, nullable: true },
  ],
};

export default schema;
