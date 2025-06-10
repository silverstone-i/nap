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
  table: 'addresses',
  hasAuditFields: true,
  version: '1.0.0',
  constraints: {
    primaryKey: ['id'],
    indexes: [
      {
        type: 'Index',
        columns: ['postal_code'],
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
    { name: 'label', type: 'varchar(64)', nullable: true },
    { name: 'street', type: 'varchar(255)', nullable: false },
    { name: 'city', type: 'varchar(100)', nullable: false },
    { name: 'state', type: 'varchar(64)', nullable: false },
    { name: 'postal_code', type: 'varchar(20)', nullable: false },
    { name: 'country', type: 'varchar(64)', nullable: false },
  ],
};

export default schema;
