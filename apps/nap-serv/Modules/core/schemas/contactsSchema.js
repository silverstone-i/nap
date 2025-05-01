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
  table: 'contacts',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    indexes: [
      {
        type: 'Index',
        columns: ['tenant_id', 'last_name'],
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
    { name: 'first_name', type: 'varchar(64)', nullable: false },
    { name: 'last_name', type: 'varchar(64)', nullable: false },
    { name: 'email', type: 'varchar(128)', nullable: true },
    { name: 'phone', type: 'varchar(32)', nullable: true },
    { name: 'role', type: 'varchar(64)', nullable: true },
  ],
};

export default schema;
