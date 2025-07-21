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
  buildContactRecords,
} from '../../../src/utils/sourcesImportUtils.js';
import db from '../../../src/db/db.js';
import fs from 'fs';
import logger from '../../../src/utils/logger.js';

class ContactsController extends BaseController {
  constructor() {
    super('contacts');
  }

  /**
   * Import contacts and sources from XLSX file.
   * Expects columns: source_type, code, label, name, email, phone, mobile, fax, position
   * Resolves table_id for each source, inserts deduplicated sources, then contacts.
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
        const contactsModel = this.model(schema);
        contactsModel.tx = t;
        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;

        const codeGroups = await resolveTableIds(rows, schema, t);
        const sourceRecords = deduplicateSourceRecords(rows, codeGroups, tenantCode, createdBy);
        const sourceIdMap = await insertAndMergeSources(sourceRecords, schema, sourcesModel);
        const contactRecords = buildContactRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy);

        await contactsModel.bulkInsert(contactRecords, []);
      });

      res.status(201).json({ inserted: rows.length });
    } catch (err) {
      console.error(err);
      res.status(400).json({ error: err.message });
    }
  }
}

const instance = new ContactsController();

export default instance; // Use in production and development environments
export { ContactsController }; // Use in test environment
