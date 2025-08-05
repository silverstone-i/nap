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
const matchReviewLogsSchema = {
  dbSchema: 'tenantid',
  table: 'match_review_logs',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_sku_id', type: 'uuid', notNull: true },
    { name: 'original_catalog_sku_id', type: 'uuid', notNull: false },
    { name: 'updated_catalog_sku_id', type: 'uuid', notNull: true },
    { name: 'confidence_before', type: 'float', notNull: false },
    { name: 'confidence_after', type: 'float', notNull: false },
    { name: 'notes', type: 'text', notNull: false },
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
      {
        type: 'ForeignKey',
        columns: ['original_catalog_sku_id'],
        references: { table: 'catalog_skus', columns: ['id'] },
        onDelete: 'SET NULL',
      },
      {
        type: 'ForeignKey',
        columns: ['updated_catalog_sku_id'],
        references: { table: 'catalog_skus', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { type: 'Index', columns: ['vendor_sku_id'] },
      { type: 'Index', columns: ['updated_catalog_sku_id'] },
    ],
  },
};

export default matchReviewLogsSchema;