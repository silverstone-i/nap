import { TableModel } from 'pg-schemata';
import vendorSkusSchema from '../schemas/vendorSkusSchema.js';

class VendorSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorSkusSchema, logger);
  }

  /**
   * Find a vendor SKU by vendor_id and vendor_sku
   * @param {string} vendor_id
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
}

export default VendorSkus;
