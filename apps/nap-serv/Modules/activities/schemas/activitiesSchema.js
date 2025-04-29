'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const activitiesSchema = {
  dbSchema: 'tenantid',
  table: 'activities',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuid_generate_v4()', nullable: false, immutable: true, colProps: { cnd: true }},
    { name: 'activity_id', type: 'varchar', length: 10, nullable: false, colProps: { cnd: true }},
    { name: 'name', type: 'varchar', length: 255, nullable: false },
    { name: 'category_id', type: 'uuid', nullable: false, colProps: { cnd: true }},
    { name: 'type', type: 'varchar', length: 50, nullable: false, default: `'turnkey'` },
    { name: 'description', type: 'text', nullable: true }
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['category_id'],
        references: { table: 'tenantid.categories', columns: ['id'] },
        onDelete: 'CASCADE'
      }
    ],
    indexes: [{ type: 'Index', columns: ['category_id', 'type'] }]
  }
};

export default activitiesSchema;