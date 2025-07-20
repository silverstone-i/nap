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
import ExcelJS from 'exceljs';
import db from '../../../src/db/db.js';
import fs from 'fs';
import logger from '../../../src/utils/logger.js';

async function parseWorksheet(filePath, sheetIndex) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[sheetIndex];
  if (!worksheet) {
    throw new Error(`Sheet index ${sheetIndex} not found.`);
  }

  const rows = [];
  let headers = [];
  worksheet.eachRow((row, rowNumber) => {
    const values = row.values;
    if (rowNumber === 1) {
      headers = values.slice(1);
    } else {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = values[i + 1];
      });
      rows.push(obj);
    }
  });

  return rows;
}

async function resolveTableIds(rows, schema, tx) {
  const typeMap = { vendor: 'vendors', client: 'clients', employee: 'employees' };
  const codeGroups = { vendor: new Map(), client: new Map(), employee: new Map() };

  // Collect all unique codes for each source_type from the input rows
  for (const row of rows) {
    codeGroups[row.source_type]?.set(row.code, null);
  }

  // For each source_type, query the DB for matching codes and store their IDs
  for (const [type, codeMap] of Object.entries(codeGroups)) {
    const table = `${schema}.${typeMap[type]}`;
    const codeCol = `${type}_code`;
    const codes = Array.from(codeMap.keys());
    if (codes.length > 0) {
      const found = await tx.any(`SELECT id, ${codeCol} FROM ${table} WHERE ${codeCol} IN ($1:csv)`, [codes]);
      for (const rec of found) {
        codeMap.set(rec[codeCol], rec.id);
      }
    }
  }

  return codeGroups;
}

function deduplicateSourceRecords(rows, codeGroups, tenantCode, createdBy) {
  const uniqueKeys = new Set();
  const sourceRecords = [];

  for (const row of rows) {
    const tableId = codeGroups[row.source_type].get(row.code);
    if (!tableId) throw new Error(`No ${row.source_type} found for code: ${row.code}`);

    const key = `${tableId}|${row.source_type}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.add(key);
      sourceRecords.push({
        tenant_code: tenantCode,
        table_id: tableId,
        source_type: row.source_type,
        created_by: createdBy,
      });
    }
  }

  return sourceRecords;
}

async function insertAndMergeSources(sourceRecords, schema, sourcesModel) {
  const searchParams = sourceRecords.map(r => [r.table_id, r.source_type]);

  // Build value tuples and flat values for parameterized query
  const valueTuples = searchParams.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const flatValues = searchParams.flat();

  const existingSources = await sourcesModel.tx.any(
    `SELECT id, table_id, source_type FROM ${schema}.sources
     WHERE (table_id, source_type) IN (${valueTuples})`,
    flatValues
  );

  const existingMap = new Map(existingSources.map(r => [`${r.table_id}|${r.source_type}`, r]));
  const toInsert = sourceRecords.filter(r => !existingMap.has(`${r.table_id}|${r.source_type}`));
  let inserted = [];
  if (toInsert.length > 0) {
    inserted = await sourcesModel.bulkInsert(toInsert, ['table_id', 'source_type', 'id']);
  }
  const sourceIdMap = new Map();
  for (const r of [...inserted, ...existingSources]) {
    sourceIdMap.set(`${r.table_id}|${r.source_type}`, r.id);
  }
  return sourceIdMap;
}

function buildAddressRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy) {
  return rows.map(row => {
    const tableId = codeGroups[row.source_type].get(row.code);
    const sourceId = sourceIdMap.get(`${tableId}|${row.source_type}`);
    return {
      tenant_code: tenantCode,
      source_id: sourceId,
      label: row.label.toLowerCase(),
      address_line1: row.address_line1,
      address_line2: row.address_line2 || null,
      city: row.city,
      state: row.state,
      zip: String(row.zip),
      country: row.country,
      created_by: createdBy,
    };
  });
}

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
      const filePath = `/tmp/export_addresses_${timestamp}.xlsx`;
      const where = req.body.where || [];
      const joinType = req.body.joinType || 'AND';
      const options = req.body.options || {};

      await db('exportAddresses', req.schema).exportToSpreadsheet(filePath, where, joinType, options);

      res.download(filePath, `export_addresses_${timestamp}.xlsx`, err => {
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
