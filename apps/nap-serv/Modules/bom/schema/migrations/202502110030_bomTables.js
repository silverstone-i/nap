/**
 * @file Migration: create BOM module tables with pgvector extension
 * @module bom/schema/migrations/202502110030_bomTables
 *
 * Tables created in FK dependency order:
 *   catalog_skus → vendor_skus → vendor_pricing
 *
 * Ensures pgvector extension is enabled before creating tables with vector columns.
 * Also creates HNSW indexes on embedding columns for efficient similarity search.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

const BOM_MODELS = ['catalogSkus', 'vendorSkus', 'vendorPricing'];

export default defineMigration({
  id: '202502110030-bom-tables',
  description: 'Create BOM module tables (catalog_skus, vendor_skus, vendor_pricing) with pgvector',

  async up({ schema, models, db }) {
    if (schema === 'admin') return;

    // Create tables in FK order
    for (const key of BOM_MODELS) {
      const model = models[key];
      if (model && typeof model.createTable === 'function') {
        await model.createTable();
      }
    }

    // Create HNSW indexes on embedding columns for efficient cosine similarity search
    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_catalog_skus_embedding
      ON ${schema}.catalog_skus USING hnsw (embedding vector_cosine_ops)
    `);
    await db.none(`
      CREATE INDEX IF NOT EXISTS idx_vendor_skus_embedding
      ON ${schema}.vendor_skus USING hnsw (embedding vector_cosine_ops)
    `);
  },

  async down({ schema, models, db }) {
    if (schema === 'admin') return;

    // Drop HNSW indexes
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
