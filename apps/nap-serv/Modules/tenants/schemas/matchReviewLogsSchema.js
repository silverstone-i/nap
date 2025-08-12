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
  dbSchema: 'admin',
  table: 'match_review_logs',
  version: '1.0.0',
  hasAuditFields: true,
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_id', type: 'uuid', notNull: true },
    { name: 'vendor_sku', type: 'varchar(100)', notNull: true },
    { name: 'vendor_description', type: 'text', notNull: true },
    { name: 'vendor_description_normalized', type: 'text', notNull: true },
    { name: 'catalog_sku', type: 'varchar(100)', notNull: false },
    { name: 'catalog_description', type: 'text', notNull: false },
    { name: 'catalog_description_normalized', type: 'text', notNull: false },
    { name: 'confidence', type: 'float', notNull: false },
    { name: 'match_threshold', type: 'float', notNull: false },
    { name: 'event_type', type: 'varchar(10)', notNull: true },
    { name: 'status', type: 'varchar(30)', notNull: true, default: "'ok'" },
    { name: 'notes', type: 'text', notNull: false },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [{ type: 'Check', columns: ['event_type'], expression: "event_type IN ('insert','update','upsert','snapshot')" }],
    indexes: [
      { type: 'Index', columns: ['vendor_id', 'vendor_sku'] },
      { type: 'Index', columns: ['catalog_sku'] },
    ],
  },
};

export default matchReviewLogsSchema;
