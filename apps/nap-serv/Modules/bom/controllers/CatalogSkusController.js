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
import { normalizeDescription, generateEmbedding } from '../utils/embeddingUtils.js';

class CatalogSkusController extends BaseController {
  constructor() {
    super('catalogSkus');
  }

  async importXls(req, res) {
    try {
      const { user } = req;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const rows = await parseWorksheet(file.path, index);

      const dto = rows.map(row => ({
        ...row,
        tenant_code: user.tenant_code,
        created_by: user.user_name,
      }));

      req.body = dto;
      return this.bulkInsert(req, res);
    } catch (err) {
      console.error('Error importing XLS:', err);
      res.status(500).json({
        message: 'Failed to import XLS file',
        error: err.message || 'Unknown error',
      });
    }
  }

  /**
   * Bulk insert catalog SKUs
   */
  async bulkInsert(req, res) {
    try {
      const { schema } = req;
      const skus = req.body;

      if (!Array.isArray(skus) || skus.length === 0) {
        return res.status(400).json({ error: 'No SKUs provided for insertion' });
      }

      // Normalize and embed description text
      const normalizedSkus = await Promise.all(
        skus.map(async sku => {
          const description_normalized = normalizeDescription(sku.description);
          const { embedding, model } = await generateEmbedding(description_normalized);
          return {
            ...sku,
            description_normalized,
            model: model || 'text-embedding-3-large',
            embedding,
          };
        })
      );

      const result = await this.model(schema).bulkInsert(normalizedSkus);
      res.status(201).json({ message: `${result} SKUs inserted` });
    } catch (err) {
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  }

  /**
   * Bulk update catalog SKUs (if enabled)
   */
  async bulkUpdate(req, res) {
    try {
      // TODO: normalize new descriptions, re-embed, update
    } catch (err) {
      this.error(res, err);
    }
  }

  /**
   * Get all catalog SKUs with optional filtering
   */
  async getAllCatalogSkus(req, res) {
    try {
      // TODO: implement filtering by category/subcategory
    } catch (err) {
      this.error(res, err);
    }
  }
}

const instance = new CatalogSkusController();

export default instance;
export { CatalogSkusController };
