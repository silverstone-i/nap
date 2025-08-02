'use strict';

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import { QueryModel } from 'pg-schemata';
import db from '../../../src/db/db.js';
import { pgp } from '../../../src/db/db.js';
import { matchVendorToCatalogEmbeddings } from '../../../src/utils/embeddingUtils.js';

class EmbeddingMatchesController extends BaseController {
  constructor() {
    super('embeddingMatches');
  }

  /**
   * Execute matching for given vendor SKUs (empty array = all vendors)
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs, empty for all vendors
   * @param {Object} options - Additional options (e.g., threshold)
   * @returns {Promise<{matched: Array, lowConfidence: Array}>} - Arrays of match records including created_by
   */
  async executeMatches(req, res) {
    try {
      const { vendorIds = [], vendorCodes = [], options = {} } = req.body;
      const threshold = options.threshold || Number(process.env.MATCH_THRESHOLD) || 0.8;
      const embeddingModel = options.embeddingModel || 'text-embedding-3-small';
      const schema = req.schema;

      // Get model instances
      const EmbeddingSkus = db('embeddingSkus', schema);
      const EmbeddingMatches = db('embeddingMatches', schema);

      //Fetch vendorId's, if needed
      if (vendorCodes.length > 0) {
        const conditions = [{ vendor_code: { $in: vendorCodes } }];
        const vendors = await db('vendors', schema).findWhere(conditions, 'OR', { columnWhitelist: ['id'] });

        if (vendors.length > 0) {
          vendorIds.push(...vendors.map(v => v.id));
        }
      }

      // Fetch vendor embeddings
      let vendorEmbeddings;
      if (vendorIds.length === 0) {
        vendorEmbeddings = await EmbeddingSkus.findAllVendorEmbeddings(embeddingModel);
      } else {
        vendorEmbeddings = await this.findVendorEmbeddingsByIds(vendorIds, schema, embeddingModel);
      }

      // Fetch catalog embeddings
      const catalogEmbeddings = await EmbeddingSkus.findAllCatalogEmbeddings(embeddingModel);

      // Delete existing matches for these vendor embeddings
      if (vendorEmbeddings.length > 0) {
        const embeddingSkuIds = vendorEmbeddings.map(e => e.id);
        const result = await EmbeddingMatches.deleteByEmbeddingSkuIds(embeddingSkuIds);
        console.log(`Deleted ${result} existing matches for vendor embeddings`);
      }

      // Use utility function for matching
      const { matches, lowConfidence } = matchVendorToCatalogEmbeddings(vendorEmbeddings, catalogEmbeddings, {
        threshold,
        embeddingModel,
        tenantCode: req.user.tenant_code,
        created_by: req.user.user_name,
      });

      // Bulk insert matched records
      if (matches.length > 0) {
        await EmbeddingMatches.bulkInsert(matches);
      }

      const lowConfidenceResults = await this.getReadableLowConfidenceMatches(schema, lowConfidence);

      res.status(200).json({
        lowConfidence: lowConfidenceResults,
      });
    } catch (err) {
      console.error('Error executing matches:', err);
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * Fetch vendor embeddings by array of vendor IDs
   * @param {Array<string>} vendorIds - Array of vendor SKU IDs
   * @param {string} [embeddingModel] - Optional AI model filter
   * @returns {Promise<Array>} Array of vendor embedding records
   */
  async findVendorEmbeddingsByIds(vendorIds, schema, embeddingModel = null) {
    // Custom join query to get embeddings for given vendorIds
    const model = embeddingModel ? `AND es.model = '${embeddingModel}'` : '';
    const vendorIdList = vendorIds.map(id => `'${id}'`).join(',');
    const query = `
      SELECT es.*
      FROM ${schema}.embedding_skus es
      JOIN ${schema}.vendor_skus vs ON es.sku_id = vs.id
      WHERE vs.vendor_id IN (${vendorIdList})
      ${model}
      AND es.source = 'vendor'
    `;

    return await db.any(query);
  }

  /**
   * Returns enriched low-confidence match data (SKU details) for an array of match objects
   * @param {Object} db - pg-promise db instance
   * @param {string} schema - tenant schema (e.g. 'ciq')
   * @param {Array} matches - array of objects with vendor_embedding_id, catalog_embedding_id, model, input_type
   */
  async getReadableLowConfidenceMatches(schema, matches) {    
    if (!matches?.length) return [];

    const valid = matches.filter(m =>
      m.vendor_embedding_id &&
      m.catalog_embedding_id &&
      m.confidence &&
      m.model &&
      m.input_type
    );
    if (valid.length === 0) return [];

    const valueTuples = valid.map(m =>
      `('${m.vendor_embedding_id}'::uuid, '${m.catalog_embedding_id}'::uuid, ${m.confidence}, '${m.model}', '${m.input_type}')`
    );
    const valuesSQL = valueTuples.join(',\n');

    const query = `
      WITH input (vendor_embedding_id, catalog_embedding_id, confidence, model, input_type) AS (
        VALUES ${valuesSQL}
      )
      SELECT
        vs.vendor_sku,
        vs.description AS vendor_description,
        cs.catalog_sku,
        cs.description AS catalog_description,
        i.vendor_embedding_id,
        i.catalog_embedding_id,
        i.confidence,
        i.model,
        i.input_type
      FROM input i
      JOIN ${schema}.embedding_skus ev ON i.vendor_embedding_id = ev.id
      JOIN ${schema}.vendor_skus vs ON ev.sku_id = vs.id
      JOIN ${schema}.embedding_skus ec ON i.catalog_embedding_id = ec.id
      JOIN ${schema}.catalog_skus cs ON ec.sku_id = cs.id;
    `;    

    return db.any(query);
  }
}

const instance = new EmbeddingMatchesController();
export default instance;
export { EmbeddingMatchesController };
