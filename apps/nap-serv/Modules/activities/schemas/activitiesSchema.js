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
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'category_id'],
        references: {
          table: 'tenantid.categories',
          columns: ['tenant_id', 'category_id'],
        },
        onDelete: 'CASCADE',
      },
    ],
    unique: [['tenant_id', 'activity_id']],
    indexes: [
      {
        type: 'Index',
        columns: ['tenant_id', 'category_id'],
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
    { name: 'activity_id', type: 'varchar(12)', nullable: false },
    { name: 'name', type: 'varchar(32)', nullable: false },
    { name: 'category_id', type: 'varchar(12)', nullable: false },
    {
      name: 'type',
      type: 'varchar(12)',
      nullable: false,
      default: `'turnkey'`,
    },
    { name: 'description', type: 'text', nullable: true },
  ],
};

export default schema;
