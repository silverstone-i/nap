'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const costLinesSchema = {
  dbSchema: 'tenantid',
  table: 'cost_lines',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuid_generate_v4()', nullable: false, immutable: true},
    { name: 'activity_id', type: 'uuid', nullable: false, colProps: { cnd: true }},
    { name: 'type', type: 'varchar', length: 50, nullable: false },
    { name: 'amount', type: 'numeric', nullable: false },
    { name: 'vendor_id', type: 'uuid', nullable: false, colProps: { cnd: true }}
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { schema: 'tenantid',table: 'activities', columns: ['id'] },
        onDelete: 'CASCADE'
      },
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: { schema: 'tenantid', table: 'vendors', columns: ['id'] },
        onDelete: 'RESTRICT'
      }
    ],
    indexes: [
      { type: 'Index', columns: ['activity_id', 'type'] },
      { type: 'Index', columns: ['vendor_id'] }
    ]
  }
};

export default costLinesSchema;