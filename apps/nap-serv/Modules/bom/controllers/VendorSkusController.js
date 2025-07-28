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
import db from '../../../src/db/db.js';

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
      const schema = req.schema;

      if (!tenantCode || !schema) {
        return res.status(400).json({ error: 'Missing tenant context' });
      }

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let result;
      await db.tx(async t => {
        // Use injected models or fall back to db() calls
        const vendorsModel = this.vendorsModel || db('vendors', schema);
        const vendorSkusModel = this.model || db('vendorSkus', schema);
        const embeddingSkusModel = this.embeddingSkusModel || db('embeddingSkus', schema);

        vendorsModel.tx = t;
        vendorSkusModel.tx = t;
        embeddingSkusModel.tx = t;

        // Preload all vendors for this tenant
        const vendors = await vendorsModel.findAll({ limit: 0 });
        const vendorLookup = new Map(vendors.map(v => [v.vendor_code, v.id]));

        // Import and transform each row
        const imported = await vendorSkusModel.importFromSpreadsheet(
          file.path,
          index,
          row => {
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
          },
          ['id', 'tenant_code', 'vendor_sku', 'description', 'vendor_id', 'tenant_code', 'created_by']
        );

        // console.log('Imported SKUs:', imported);

        // After import, generate embeddings for the imported SKUs
        const importedSkus = Array.isArray(imported) ? imported : imported.inserted || [];

        // Import the utility and OpenAI embedding service
        const { generateEmbeddingsForSkus, openaiEmbeddingService } = await import('../../../src/utils/embeddingUtils.js');

        // Call embedding utility with OpenAI embedding service
        const embeddings = await generateEmbeddingsForSkus(
          importedSkus,
          {
            model: 'text-embedding-3-small',
            inputType: 'description',
          },
          'vendor',
          // Use OpenAI embedding service
          openaiEmbeddingService
        );

        // Save embeddings to embedding_skus table
        await embeddingSkusModel.bulkInsert(embeddings);

        result = { imported, embeddings };
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
