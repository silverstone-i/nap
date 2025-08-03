'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import { parseWorksheet } from '../../../src/utils/xlsUtils.js';

class VendorSkusController extends BaseController {
  constructor() {
    super('vendorSkus');
    this.vendorSkusModel = repositories.vendorSkus;
    this.catalogSkusModel = repositories.catalogSkus;
    this.vendorPricingModel = repositories.vendorPricing;
  }

  /**
   * Import vendor SKUs from spreadsheet (csv/xlsx)
   */
  async importVendorSkusFromSpreadsheet(req, res) {
    try {
    } catch (err) {
    }
  }

  /**
   * Bulk insert vendor SKUs from JSON array
   */
  async bulkInsertVendorSkus(req, res) {
    try {
    } catch (err) {
    }
  }

  /**
   * Get all unmatched vendor SKUs for the current tenant
   */
  async getUnmatchedVendorSkus(req, res) {
    try {
    } catch (err) {
    }
  }
}

const instance = new VendorSkusController();

export default instance; // Use in production and development environments
export { VendorSkusController }; // Use in test environment
