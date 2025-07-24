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

/**
 * Vendor SKUs table schema
 * Maps vendor-specific SKUs to catalog SKUs
 * @type {TableSchema}
 */
const vendorSkusSchema = {
  dbSchema: 'tenantid',
  table: 'vendor_skus',
  hasAuditFields: true,
  version: '1.0.0',
  softDelete: true,
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_sku', type: 'varchar(32)', notNull: true },
    { name: 'description', type: 'varchar(512)', notNull: true },
    { name: 'unit_price', type: 'numeric', notNull: true, default: 0.0 },
    { name: 'unit', type: 'varchar(32)', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['vendor_sku']],
    indexes: [
      { type: 'Index', columns: ['vendor_id'] },
      { type: 'Index', columns: ['vendor_sku'] },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['vendor_id'],
        references: {
          table: 'vendors',
          columns: ['id'],
        },
        onDelete: 'cascade',
      },
    ],
  },
};

export default vendorSkusSchema;
