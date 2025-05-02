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
  table: 'activities',
  hasAuditFields: true,
  version: '1.0.0',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'uuidv7()',
      nullable: false,
      immutable: true,
      colProps: { cnd: true },
    },
    {
      name: 'tenant_id',
      type: 'uuid',
      nullable: false,
      colProps: { cnd: true },
    },
    {
      name: 'category_id',
      type: 'uuid',
      nullable: false,
    },
    {
      name: 'activity_code',
      type: 'varchar(20)',
      nullable: false,
    },
    {
      name: 'name',
      type: 'varchar(100)',
      nullable: false,
    },
    {
      name: 'description',
      type: 'text',
      nullable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'activity_code']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['category_id'],
        references: { table: 'tenantid.categories', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [{ type: 'Index', columns: ['tenant_id', 'category_id'] }],
  },
};

export default schema;
