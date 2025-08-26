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
import {
  resolveTableIds,
  deduplicateSourceRecords,
  insertAndMergeSources,
  buildAddressRecords,
} from '../../../src/utils/sourcesImportUtils.js';
import db from '../../../src/db/db.js';
import fs from 'fs';
import logger from '../../../src/utils/logger.js';

class AddressesController extends BaseController {
  constructor() {
    super('addresses');
  }

  /**
   * Import addresses and sources from XLSX file.
   * Expects columns: source_type, code, label, address_line1, address_line2, city, state, zip, country
   * Resolves table_id for each source, inserts deduplicated sources, then addresses.
   */
  async importXls(req, res) {
    try {
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.user_name || req.user?.email;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;
      const schema = req.schema;

      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const rows = await parseWorksheet(file.path, index);

      await db.tx(async t => {
        const addressesModel = this.model(schema);
        addressesModel.tx = t;
        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;

        const codeGroups = await resolveTableIds(rows, schema, t);
        const sourceRecords = deduplicateSourceRecords(rows, codeGroups, tenantCode, createdBy);
        const sourceIdMap = await insertAndMergeSources(sourceRecords, schema, sourcesModel);
        const addressRecords = buildAddressRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy);

        await addressesModel.bulkInsert(addressRecords, []);
      });

      res.status(201).json({ inserted: rows.length });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }

  async exportXls(req, res) {
    try {
      const timestamp = Date.now();
      const filePath = `/tmp/addresses_${timestamp}.xlsx`;
      const where = req.body.where || [];
      const joinType = req.body.joinType || 'AND';
      const options = req.body.options || {};

      await db('exportAddresses', req.schema).exportToSpreadsheet(filePath, where, joinType, options);

      res.download(filePath, `addresses_${timestamp}.xlsx`, err => {
        if (err) {
          logger.error(`Error sending file: ${err.message}`);
        }
        fs.unlink(filePath, err => {
          if (err) logger.error(`Failed to delete exported file: ${err.message}`);
        });
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
}

const instance = new AddressesController();

export default instance; // Use in production and development environments
export { AddressesController }; // Use in test environment
