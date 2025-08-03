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

      console.log('Importing catalog SKUs:', dto);

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
      console.log('Bulk inserting catalog SKUs:', req.body);

      // TODO: validate input, normalize descriptions, embed, insert
      res.status(201).json({ message: 'Bulk insert not implemented yet' });
    } catch (err) {
      this.error(res, err);
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
