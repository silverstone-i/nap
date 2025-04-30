'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

// const costLinesSchema = {
//   dbSchema: 'tenantid',
//   table: 'cost_lines',
//   hasAuditFields: true,
//   version: '1.0.0',
//   columns: [
//     { name: 'id', type: 'uuid', default: 'uuid_generate_v4()', nullable: false, immutable: true},
//     { name: 'activity_id', type: 'uuid', nullable: false, colProps: { cnd: true }},
//     { name: 'type', type: 'varchar', length: 50, nullable: false },
//     { name: 'amount', type: 'numeric', nullable: false },
//     { name: 'vendor_id', type: 'uuid', nullable: false, colProps: { cnd: true }}
//   ],
//   constraints: {
//     primaryKey: ['id'],
//     foreignKeys: [
//       {
//         type: 'ForeignKey',
//         columns: ['activity_id'],
//         references: { schema: 'tenantid',table: 'activities', columns: ['id'] },
//         onDelete: 'CASCADE'
//       },
//       {
//         type: 'ForeignKey',
//         columns: ['vendor_id'],
//         references: { schema: 'tenantid', table: 'vendors', columns: ['id'] },
//         onDelete: 'RESTRICT'
//       }
//     ],
//     indexes: [
//       { type: 'Index', columns: ['activity_id', 'type'] },
//       { type: 'Index', columns: ['vendor_id'] }
//     ]
//   }
// };

const costLinesSchema = {
  dbSchema: 'tenantid',
  table: 'cost_lines',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'serial', nullable: false, immutable: true, colProps: { cnd: true } },
    { name: 'activity_id', type: 'int', nullable: false },
    { name: 'vendor_part_id', type: 'int', nullable: true },
    { name: 'quantity', type: 'numeric(12,4)', nullable: false },
    { name: 'markup_pct', type: 'numeric(5,2)', nullable: true },
    { name: 'assembly_code', type: 'varchar', length: 64, nullable: true }
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['activity_id'],
        references: { table: 'tenantid.activity_codes', columns: ['id'] },
        onDelete: 'CASCADE'
      },
      {
        type: 'ForeignKey',
        columns: ['vendor_part_id'],
        references: { table: 'tenantid.vendor_parts', columns: ['id'] },
        onDelete: 'SET NULL'
      }
    ],
    indexes: [
      { type: 'Index', columns: ['activity_id'] },
      { type: 'Index', columns: ['assembly_code'] }
    ]
  }
};

export default costLinesSchema;