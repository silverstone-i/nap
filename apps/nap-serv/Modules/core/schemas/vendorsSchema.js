'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

const vendorsSchema = {
  dbSchema: 'tenantid',
  table: 'vendors',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuid_generate_v4()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'name', type: 'varchar', length: 255, nullable: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['name']],
    indexes: [{ type: 'Index', columns: ['name'] }],
  },
};

export default vendorsSchema;
