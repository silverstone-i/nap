/**
 * @file Source import utilities — resolve entity codes, deduplicate sources,
 *       and build contact/address records for bulk import.
 * @module nap-serv/lib/sourcesImportUtils
 *
 * Used by contactsController.importXls and addressesController.importXls
 * to auto-create polymorphic source records when importing from spreadsheets.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Resolve vendor/client/employee codes to their UUIDs.
 * @param {object[]} rows Parsed spreadsheet rows (must have source_type, code)
 * @param {string} schema Tenant schema name
 * @param {object} tx pg-promise transaction
 * @returns {Promise<object>} Map of { vendor: Map<code, id>, client: ..., employee: ... }
 */
export async function resolveTableIds(rows, schema, tx) {
  const typeMap = { vendor: 'vendors', client: 'clients', employee: 'employees' };
  const codeGroups = { vendor: new Map(), client: new Map(), employee: new Map() };

  for (const row of rows) {
    codeGroups[row.source_type]?.set(row.code, null);
  }

  for (const [type, codeMap] of Object.entries(codeGroups)) {
    const table = `${schema}.${typeMap[type]}`;
    const codes = Array.from(codeMap.keys());
    if (codes.length > 0) {
      const found = await tx.any(
        `SELECT id, code FROM ${table} WHERE code IN ($1:csv)`,
        [codes],
      );
      for (const rec of found) {
        codeMap.set(rec.code, rec.id);
      }
    }
  }

  return codeGroups;
}

/**
 * Deduplicate source records from import rows.
 * @param {object[]} rows Parsed spreadsheet rows
 * @param {object} codeGroups Result from resolveTableIds
 * @param {string} tenantCode Tenant code for audit
 * @param {string} createdBy User UUID for audit
 * @returns {object[]} Unique source records ready for insert
 */
export function deduplicateSourceRecords(rows, codeGroups, tenantCode, createdBy) {
  const uniqueKeys = new Set();
  const sourceRecords = [];

  for (const row of rows) {
    const tableId = codeGroups[row.source_type]?.get(row.code);
    if (!tableId) {
      throw new Error(`No ${row.source_type} found for code: ${row.code}`);
    }
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

/**
 * Insert new sources or retrieve existing ones, returning a lookup map.
 * @param {object[]} sourceRecords Deduplicated source records
 * @param {string} schema Tenant schema name
 * @param {object} sourcesModel Schema-bound Sources model (with .tx set)
 * @returns {Promise<Map<string, string>>} Map of "tableId|sourceType" → source UUID
 */
export async function insertAndMergeSources(sourceRecords, schema, sourcesModel) {
  const searchParams = sourceRecords.map((r) => [r.table_id, r.source_type]);
  const valueTuples = searchParams.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
  const flatValues = searchParams.flat();

  const existingSources = await sourcesModel.tx.any(
    `SELECT id, table_id, source_type FROM ${schema}.sources
     WHERE (table_id, source_type) IN (${valueTuples})`,
    flatValues,
  );

  const existingMap = new Map(existingSources.map((r) => [`${r.table_id}|${r.source_type}`, r]));
  const toInsert = sourceRecords.filter((r) => !existingMap.has(`${r.table_id}|${r.source_type}`));

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

/**
 * Build contact records for bulk insert from parsed import rows.
 * @param {object[]} rows Parsed spreadsheet rows
 * @param {object} codeGroups Result from resolveTableIds
 * @param {Map<string, string>} sourceIdMap Result from insertAndMergeSources
 * @param {string} tenantCode Tenant code
 * @param {string} createdBy User UUID
 * @returns {object[]} Contact records ready for bulkInsert
 */
export function buildContactRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy) {
  return rows.map((row) => {
    const tableId = codeGroups[row.source_type].get(row.code);
    const sourceId = sourceIdMap.get(`${tableId}|${row.source_type}`);
    return {
      source_id: sourceId,
      name: row.name,
      email: row.email || null,
      phone: row.phone || null,
      mobile: row.mobile || null,
      fax: row.fax || null,
      position: row.position || null,
      created_by: createdBy,
    };
  });
}

/**
 * Build address records for bulk insert from parsed import rows.
 * @param {object[]} rows Parsed spreadsheet rows
 * @param {object} codeGroups Result from resolveTableIds
 * @param {Map<string, string>} sourceIdMap Result from insertAndMergeSources
 * @param {string} tenantCode Tenant code
 * @param {string} createdBy User UUID
 * @returns {object[]} Address records ready for bulkInsert
 */
export function buildAddressRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy) {
  return rows.map((row) => {
    const tableId = codeGroups[row.source_type].get(row.code);
    const sourceId = sourceIdMap.get(`${tableId}|${row.source_type}`);
    return {
      source_id: sourceId,
      label: row.label?.toLowerCase() || null,
      address_line_1: row.address_line_1 || null,
      address_line_2: row.address_line_2 || null,
      address_line_3: row.address_line_3 || null,
      city: row.city || null,
      state_province: row.state_province || null,
      postal_code: row.postal_code ? String(row.postal_code) : null,
      country_code: row.country_code || null,
      created_by: createdBy,
    };
  });
}
