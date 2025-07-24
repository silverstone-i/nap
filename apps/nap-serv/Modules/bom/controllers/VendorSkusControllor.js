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

import { db } from '../../../src/db/db.js';

class VendorSkusController extends BaseController {
  constructor() {
    super('vendorSkus');
  }

  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      // Preload all vendors for this tenant
      const vendors = await db('vendors', req.schema).findAll({ tenant_code: tenantCode });
      const vendorLookup = new Map(vendors.map(v => [v.vendor_code, v.id]));

      // Import and transform each row
      const result = await this.model(req.schema).importFromSpreadsheet(file.path, index, row => {
        const vendor_id = vendorLookup.get(row.vendor_code);
        if (!vendor_id) {
          throw new Error(`No vendor found for vendor_code: ${row.vendor_code}`);
        }
        // Remove vendor_code from row
        const { vendor_code, ...rest } = row;
        return {
          ...rest,
          vendor_id,
          tenant_code: tenantCode,
          created_by: createdBy,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

const instance = new VendorSkusController();
export default instance;
export { VendorSkusController };
