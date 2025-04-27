'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

const categoriesSchema = {
  dbSchema: 'public',
  table: 'categories',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'serial', nullable: false, immutable: true, colProps: { cnd: true }},
    { name: 'name', type: 'varchar', length: 255, nullable: false }
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['name']],
    indexes: [{ type: 'Index', columns: ['name'] }]
  }
};

export default categoriesSchema;