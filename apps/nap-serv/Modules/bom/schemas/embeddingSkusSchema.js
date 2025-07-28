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
 * Embedding SKUs table schema
 * Stores vector embeddings for SKUs from vendor_skus and catalog_skus tables
 * Used for semantic search and matching
 * @type {TableSchema}
 */
const embeddingSkusSchema = {
  dbSchema: 'tenantid',
  table: 'embedding_skus',
  hasAuditFields: true,
  version: '1.0.0',
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'sku_id', type: 'uuid', notNull: true },
    { name: 'source', type: 'text', notNull: true },
    { name: 'model', type: 'text', notNull: true },
    { name: 'input_type', type: 'text', default: "'description'", notNull: false },
    { name: 'embedding', type: 'vector(1536)', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['sku_id', 'source', 'model', 'input_type']],
    checks: [{ type: 'Check', columns: ['source'], expression: "source IN ('vendor', 'catalog')" }],
    indexes: [
      { type: 'Index', columns: ['sku_id'] },
      { type: 'Index', columns: ['source'] },
      { type: 'Index', columns: ['model'] },
      {
        type: 'Index',
        columns: ['embedding'],
        expression: "USING ivfflat (embedding vector_cosine_ops) WHERE model = 'text-embedding-3-small'",
      },
    ],
  },
};

export default embeddingSkusSchema;
