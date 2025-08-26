'use strict';
// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/** @type {TableSchema} */

const schema = {
  dbSchema: 'tenantid',
  table: 'categories',
  hasAuditFields: true,
  softDelete: true,
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
    { name: 'tenant_id', type: 'uuid', nullable: false },
    { name: 'category_id', type: 'varchar(12)', nullable: false },
    { name: 'name', type: 'varchar(32)', nullable: false },
    { name: 'description', type: 'text', nullable: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['category_id']],
    indexes: [
      {
        type: 'Index',
        columns: ['category_id'],
      },
    ],
  },
};

export default schema;
