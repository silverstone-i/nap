'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

/**
 * Resolves table IDs for source_type/code pairs from client, vendor, employee tables.
 */
export async function resolveTableIds(rows, schema, tx) {  
  const typeMap = { vendor: 'vendors', client: 'clients', employee: 'employees' };
  const codeGroups = { vendor: new Map(), client: new Map(), employee: new Map() };
  for (const row of rows) {
    codeGroups[row.source_type]?.set(row.code, null);
  }
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
  console.log('Code groups:', codeGroups);
  
  
  return codeGroups;
}

/**
 * Deduplicates source records for sources table.
 */
export function deduplicateSourceRecords(rows, codeGroups, tenantCode, createdBy) {
  const uniqueKeys = new Set();
  const sourceRecords = [];
  for (const row of rows) {
    const tableId = codeGroups[row.source_type].get(row.code);
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
 * Inserts and merges sources, returning a map of source IDs.
 */
export async function insertAndMergeSources(sourceRecords, schema, sourcesModel) {
  const searchParams = sourceRecords.map(r => [r.table_id, r.source_type]);
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

/**
 * Builds address records for bulk insert.
 */
export function buildAddressRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy) {
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

/**
 * Builds contact records for bulk insert.
 */
export function buildContactRecords(rows, codeGroups, sourceIdMap, tenantCode, createdBy) {
  return rows.map(row => {
    const tableId = codeGroups[row.source_type].get(row.code);
    const sourceId = sourceIdMap.get(`${tableId}|${row.source_type}`);
    return {
      tenant_code: tenantCode,
      source_id: sourceId,
      label: row.label.toLowerCase(),
      name: row.name,
      email: row.email,
      phone: row.phone,
      mobile: row.mobile,
      fax: row.fax,
      position: row.position,
      created_by: createdBy,
    };
  });
}
