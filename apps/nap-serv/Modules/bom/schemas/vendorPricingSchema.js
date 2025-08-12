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
  table: 'vendor_pricing',
  hasAuditFields: true,
  softDelete: true,
  version: '1.0.0',
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_sku_id', type: 'uuid', notNull: true },
    { name: 'unit_price', type: 'numeric', notNull: true },
    { name: 'unit', type: 'varchar(32)', notNull: true },
    { name: 'effective_date', type: 'date', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_sku_id'],
        references: { table: 'vendor_skus', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_sku_id'] },
      { type: 'Index', columns: ['effective_date'] },
    ],
  },
};

export default schema;
