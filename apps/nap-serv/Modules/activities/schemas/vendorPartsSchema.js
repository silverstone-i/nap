'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/


const vendorPartsSchema = {
  dbSchema: 'tenantid',
  table: 'vendor_parts',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'serial', nullable: false, immutable: true, colProps: { cnd: true } },
    { name: 'vendor_id', type: 'uuid', nullable: false },
    { name: 'part_number', type: 'varchar', length: 64, nullable: false },
    { name: 'description', type: 'varchar', length: 255, nullable: true },
    { name: 'unit', type: 'varchar', length: 32, nullable: true },
    { name: 'unit_cost', type: 'numeric(12,4)', nullable: true }
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['vendor_id', 'part_number']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { table: 'tenantid.vendors', columns: ['id'] },
        onDelete: 'CASCADE'
      }
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['part_number'] }
    ]
  }
};
export default vendorPartsSchema;