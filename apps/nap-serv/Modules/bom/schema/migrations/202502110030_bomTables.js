/**
 * @file Migration: create BOM module tables with pgvector extension
 * @module bom/schema/migrations/202502110030_bomTables
 *
 * Tables created in FK dependency order:
 *   catalog_skus → vendor_skus → vendor_pricing
 *
 * Ensures pgvector extension is enabled before creating tables with vector columns.
 * Embedding indexes are deferred — pgvector ≤ 0.8.x caps HNSW/IVFFlat at 2000 dims
 * and our embeddings are 3072-dim.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

const BOM_MODELS = ['catalogSkus', 'vendorSkus', 'vendorPricing'];

export default defineMigration({
  id: '202502110030-bom-tables',
  description: 'Create BOM module tables (catalog_skus, vendor_skus, vendor_pricing) with pgvector',

  async up({ schema, models, db, ensureExtensions }) {
    if (schema === 'admin') return;

    await ensureExtensions(['vector']);

    // Create tables in FK order
    for (const key of BOM_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }

    // NOTE: HNSW and IVFFlat indexes are limited to 2000 dimensions in pgvector ≤ 0.8.x.
    // Our embeddings are 3072-dim (OpenAI text-embedding-3-large), so we skip the index
    // for now. Sequential scan is fine at low volume. When data grows, options include:
    //   - Reduce to 1536-dim via `text-embedding-3-large` with `dimensions: 1536`
    //   - Use halfvec cast: USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
    //   - Upgrade pgvector when higher-dim indexes are supported
  },

  async down({ schema, models, db }) {
    if (schema === 'admin') return;

    // Drop embedding indexes if they exist (currently skipped due to 2000-dim limit)
    await db.none(`DROP INDEX IF EXISTS ${schema}.idx_catalog_skus_embedding`);
    await db.none(`DROP INDEX IF EXISTS ${schema}.idx_vendor_skus_embedding`);

    // Drop tables in reverse FK order
    const reversed = [...BOM_MODELS].reverse();
    for (const key of reversed) {
      const model = models[key];
      if (model && model.schemaName && model.tableName) {
        await db.none(`DROP TABLE IF EXISTS ${model.schemaName}.${model.tableName} CASCADE`);
      }
    }
  },
});
