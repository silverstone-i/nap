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
      const rows = await parseWorksheet(req);

      const dto = rows.map((row) => ({
        ...row,
        tenant_code: user.tenant_code,
        created_by: user.user_name,
      }));

      console.log('Importing catalog SKUs:', dto.length, 'rows');
      

      req.body = dto;
      return this.bulkInsert(req, res);
    } catch (err) {
      this.error(res, err);
    }
  }

  /**
   * Bulk insert catalog SKUs
   */
  async bulkInsert(req, res) {
    try {
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