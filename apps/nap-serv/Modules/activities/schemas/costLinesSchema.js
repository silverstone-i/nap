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
        columns: ['tenant_id', 'activity_id'],
        references: { table: 'tenantid.activities', columns: ['tenant_id', 'activity_id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'vendor_id', 'tenant_sku'],
        references: { table: 'tenantid.vendorparts', columns: ['tenant_id', 'vendor_id', 'tenant_sku'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['project_id'],
        references: { table: 'tenantid.projects', columns: ['id'] },
        onDelete: 'CASCADE',
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
      {
        type: 'Index',
        columns: ['project_id', 'activity_id'],
      },
      {
        type: 'Index',
        columns: ['vendor_id'],
      },
      {
        type: 'Index',
        columns: ['source_type'],
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
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'project_id', type: 'uuid', nullable: false },
    { name: 'vendor_id', type: 'uuid', nullable: false },
    { name: 'activity_id', type: 'varchar(12)', nullable: false },
    { name: 'tenant_sku', type: 'varchar(64)', nullable: true },
    { name: 'source_type', type: 'varchar(16)', nullable: false }, // e.g., 'material' or 'labor'
    { name: 'quantity', type: 'numeric(12,4)', nullable: false },
    { name: 'markup_pct', type: 'numeric(5,2)', nullable: true },
    { name: 'assembly_code', type: 'varchar(16)', nullable: true },
  ],
};

export default schema;
