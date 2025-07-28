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


class CatalogSkusController extends BaseController {
  constructor() {
    super('catalogSkus');
  }

  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;
      const schema = req.schema;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      let result;
      await db.tx(async t => {
        // Import and transform each row
        const catalogSkusModel = this.model(schema);
        catalogSkusModel.tx = t;
        const imported = await catalogSkusModel.importFromSpreadsheet(
          file.path,
          index,
          row => ({
            ...row,
            tenant_code: tenantCode,
            created_by: createdBy,
          }),
          ['id', 'tenant_code', 'catalog_sku', 'description', 'created_by']
        );

        // After import, generate embeddings for the imported SKUs
        const importedSkus = Array.isArray(imported) ? imported : imported.inserted || [];
        const { generateEmbeddingsForSkus, openaiEmbeddingService } = await import('../../../src/utils/embeddingUtils.js');
        const embeddings = await generateEmbeddingsForSkus(
          importedSkus,
          {
            model: 'text-embedding-3-small',
            inputType: 'description',
          },
          'catalog',
          openaiEmbeddingService
        );

        // Save embeddings to embedding_skus table
        const embeddingSkusModel = db('embeddingSkus', schema);
        embeddingSkusModel.tx = t;
        await embeddingSkusModel.bulkInsert(embeddings);

        result = { imported, embeddings };
      });

      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

const instance = new CatalogSkusController();
export default instance;
export { CatalogSkusController };
