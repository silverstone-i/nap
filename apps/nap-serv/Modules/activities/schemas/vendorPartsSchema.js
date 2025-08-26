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
  table: 'vendorparts',
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
    { name: 'vendor_id', type: 'uuid', nullable: false },
    { name: 'vendor_sku', type: 'varchar(64)', nullable: false },
    { name: 'tenant_sku', type: 'varchar(64)', nullable: false },
    { name: 'description', type: 'varchar(64)', nullable: true },
    { name: 'unit', type: 'varchar(32)', nullable: true },
    { name: 'unit_cost', type: 'numeric(12,4)', nullable: true },
    {
      name: 'currency',
      type: 'varchar(3)',
      nullable: false,
    },
    {
      name: 'is_active',
      type: 'boolean',
      default: true,
      nullable: false,
    },
    { name: 'markup_pct', type: 'numeric(5,2)', nullable: true },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: {
          table: 'vendors',
          columns: ['id'],
        },
        onDelete: 'CASCADE',
      },
    ],
    unique: [['vendor_id', 'tenant_sku']],
    indexes: [
      {
        type: 'Index',
        columns: ['vendor_id'],
      },
      {
        type: 'Index',
        columns: ['tenant_sku'],
      },
      {
        type: 'Index',
        columns: ['vendor_sku'],
      },
      {
        type: 'Index',
        columns: ['vendor_id', 'tenant_sku', 'version'],
      },
    ],
  },
};

export default schema;
