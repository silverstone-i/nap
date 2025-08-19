import { TableModel } from 'pg-schemata';
import vendorSkusSchema from '../schemas/vendorSkusSchema.js';
import { normalizeDescription, generateEmbedding, matchToCatalog } from '../utils/embeddingUtils.js';

/**
 * @typedef {string} uuid
 */

class VendorSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorSkusSchema, logger);
  }

  /**
   * Find a vendor SKU by vendor_id and vendor_sku
   * @param {uuid} vendor_id
   * @param {string} vendor_sku
   * @returns {Promise<Object|null>}
   */
  async findBySku(vendor_id, vendor_sku) {
    return this.findOneBy([{ vendor_id }, { vendor_sku }]);
  }

  /**
   * Get all vendor SKUs that are not matched to a catalog SKU
   * @returns {Promise<Object[]>}
   */
  async getUnmatched() {
    return this.findWhere([{ catalog_sku_id: null }]);
  }

  /**
   * Refresh embeddings for provided vendor SKUs.
   * @param {Array<{vendor_id: uuid, vendor_skus: string[]}>} vendorSkuBatches
   * @returns {Promise<void>}
   */
  async refreshEmbeddings(vendorSkuBatches) {
    // Logic to refresh embeddings for specific vendor SKU batches
    for (const batch of vendorSkuBatches) {
      const { vendor_id, vendor_skus } = batch;
      const descriptions = vendor_skus.map(sku => normalizeDescription(sku));
      const embeddings = await Promise.all(descriptions.map(desc => generateEmbedding(desc)));
      await this.updateEmbeddings(vendor_id, vendor_skus, embeddings);
    }
    
  }
}

export default VendorSkus;
