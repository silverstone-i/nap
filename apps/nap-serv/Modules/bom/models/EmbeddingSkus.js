'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import embeddingSkusSchema from '../schemas/embeddingSkusSchema.js';

class EmbeddingSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, embeddingSkusSchema, logger);
  }

  /**
   * Find embeddings by SKU ID and source
   * @param {string} skuId - The SKU ID to search for
   * @param {string} source - The source ('vendor' or 'catalog')
   * @param {string} [embeddingModel] - Optional AI model filter (e.g., 'text-embedding-3-small')
   * @returns {Promise<Array>} Array of embedding records
   */
  async findBySkuAndSource(skuId, source, embeddingModel = null) {
    const conditions = [{ sku_id: skuId }, { source }];
    if (embeddingModel) {
      conditions.push({ model: embeddingModel });
    }
    return this.findWhere(conditions, 'AND');
  }

  /**
   * Find similar embeddings using cosine similarity
   * @param {Array<number>} embedding - The embedding vector to compare against
   * @param {string} embeddingModel - The AI model used for the embedding (e.g., 'text-embedding-3-small')
   * @param {number} [limit=10] - Maximum number of results to return
   * @param {number} [threshold=0.8] - Minimum similarity threshold
   * @returns {Promise<Array>} Array of similar embedding records with similarity scores
   */
  async findSimilar(embedding, embeddingModel, limit = 10, threshold = 0.8) {
    const query = `
      SELECT *, 
             1 - (embedding <=> $1::vector) AS similarity
      FROM ${this.schema.dbSchema}.${this.schema.table}
      WHERE model = $2
        AND 1 - (embedding <=> $1::vector) >= $3
      ORDER BY embedding <=> $1::vector
      LIMIT $4
    `;

    return this.db.any(query, [JSON.stringify(embedding), embeddingModel, threshold, limit]);
  }

  /**
   * Upsert an embedding record
   * @param {Object} embeddingData - The embedding data to insert or update
   * @returns {Promise<Object>} The upserted record
   */
  async upsertEmbedding(embeddingData) {
    const conflictColumns = ['sku_id', 'source', 'model', 'input_type'];
    return this.upsert(embeddingData, conflictColumns);
  }

  /**
   * Fetch all vendor SKU embeddings for a given schema and optional model
   * @param {string} [embeddingModel] - Optional AI model filter
   * @returns {Promise<Array>} Array of vendor embedding records
   */
  async findAllVendorEmbeddings(embeddingModel = null) {
    const conditions = [{ source: 'vendor' }];
    if (embeddingModel) {
      conditions.push({ model: embeddingModel });
    }
    return this.findWhere(conditions, 'AND');
  }

  /**
   * Fetch all catalog SKU embeddings for a given schema and optional model
   * @param {string} [embeddingModel] - Optional AI model filter
   * @returns {Promise<Array>} Array of catalog embedding records
   */
  async findAllCatalogEmbeddings(embeddingModel = null) {
    const conditions = [{ source: 'catalog' }];
    if (embeddingModel) {
      conditions.push({ model: embeddingModel });
    }
    return this.findWhere(conditions, 'AND');
  }

  /**
   * Fetch vendor embeddings by array of vendor IDs
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs
   * @param {string} [embeddingModel] - Optional AI model filter
   * @returns {Promise<Array>} Array of vendor embedding records
   */
  async findVendorEmbeddingsByIds(vendorIds, embeddingModel = null) {
    const conditions = [{ source: 'vendor' }, { sku_id: vendorIds }];
    if (embeddingModel) {
      conditions.push({ model: embeddingModel });
    }
    return this.findWhere(conditions, 'AND');
  }
}

export default EmbeddingSkus;
