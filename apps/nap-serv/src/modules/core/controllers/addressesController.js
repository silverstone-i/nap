/**
 * @file Addresses controller — standard CRUD, with custom XLS import
 * @module core/controllers/addressesController
 *
 * Import resolves vendor/client/employee codes to source records, then
 * bulk-inserts addresses linked via source_id.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import {
  resolveTableIds,
  deduplicateSourceRecords,
  insertAndMergeSources,
  buildAddressRecords,
} from '../../../lib/sourcesImportUtils.js';
import { parseWorksheet } from '../../../lib/xlsUtils.js';

class AddressesController extends BaseController {
  constructor() {
    super('addresses');
  }

  /**
   * POST /import-xls — import addresses (and auto-create sources) from XLSX.
   * Expected columns: source_type, code, label, address_line_1, address_line_2,
   *   address_line_3, city, state_province, postal_code, country_code
   */
  async importXls(req, res) {
    try {
      const schema = this.getSchema(req);
      const tenantCode = req.user?.tenant_code;
      const createdBy = req.user?.id;
      const index = parseInt(req.body.index || '0', 10);
      const file = req.file;

      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const rows = await parseWorksheet(file.path, index);

      await db.tx(async (t) => {
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
      this.handleError(err, res, 'importing', this.errorLabel);
    }
  }
}

const instance = new AddressesController();
export default instance;
export { AddressesController };
