// @ts-check

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */

/**
 * Embedding Match table schema
 * Stores matches between vendor and catalog SKUs based on embedding similarity
 * @type {TableSchema}
 */
const embeddingMatchesSchema = {
  dbSchema: 'tenantid',
  table: 'embedding_matches',
  hasAuditFields: true,
  version: '1.0.0',
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'vendor_embedding_id', type: 'uuid', notNull: true },
    { name: 'catalog_embedding_id', type: 'uuid', notNull: true },
    { name: 'confidence', type: 'float4', notNull: true },
    { name: 'model', type: 'varchar(32)', notNull: true },
    { name: 'input_type', type: 'varchar(32)', notNull: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['vendor_embedding_id', 'catalog_embedding_id', 'model', 'input_type']],
    indexes: [
      { type: 'Index', columns: ['vendor_embedding_id'] },
      { type: 'Index', columns: ['catalog_embedding_id'] },
      { type: 'Index', columns: ['confidence'] },
    ],
  },
};

export default embeddingMatchesSchema;
