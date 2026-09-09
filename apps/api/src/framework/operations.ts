/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { HttpError } from '../util/httpError.js';
import type { QueryModel, TableModel, WhereCondition } from 'pg-schemata';
import type { FieldErrors } from '../util/fieldErrors.js';
import type { ListRequest } from './listQuery.js';
import type { ModelContract, Row } from './modelContract.js';

/**
 * Does: Represents the identifiers a batch names and where each came from
 * in the request, so a refusal can name the position of a missing one.
 * Used by: the batch operations below and the handlers that build them.
 */
export type Identified = {
  readonly ids: readonly string[];
  readonly path: (index: number) => string;
};

/**
 * Does: Builds the condition that selects the rows with the given keys.
 * Called by: the batch operations.
 */
function keyed(contract: ModelContract, ids: readonly string[]) {
  return { [contract.primaryKey]: { $in: [...ids] } };
}

/**
 * Does: Reads the rows a batch names and throws when any is missing, naming
 * the position of every missing identifier.
 * Called by: the batch operations, first, inside the tenant transaction.
 * Why: a batch write is all-or-nothing and names the identifiers it refused
 * (framework HTTP contract). A row of another tenant is invisible under
 * row-level security, so it is refused exactly like an unknown one and the
 * batch cannot probe for it. The throw rolls the transaction back.
 * @throws HttpError INVALID_INPUT keyed by each missing identifier's path.
 */
async function requireAll(
  model: QueryModel<Row>,
  contract: ModelContract,
  batch: Identified,
  archived: 'exclude' | 'only'
) {
  const where =
    archived === 'only'
      ? [keyed(contract, batch.ids), { deactivated_at: { $ne: null } }]
      : keyed(contract, batch.ids);
  const rows = await model.findWhere(where, 'AND', {
    includeDeactivated: archived === 'only',
  });
  for (const row of rows) contract.policy?.check(row);
  const present = new Set(rows.map(row => String(row[contract.primaryKey])));
  const missing: FieldErrors = {};
  for (const [index, id] of batch.ids.entries()) {
    if (!present.has(id)) missing[batch.path(index)] = ['Unknown record'];
  }
  if (Object.keys(missing).length > 0) {
    throw new HttpError('INVALID_INPUT', missing);
  }
}

/**
 * Does: Reads the rows with the given keys in key order, archived ones
 * included when asked.
 * Called by: the batch operations after they have written, to return the
 * affected records.
 */
async function reread(
  model: QueryModel<Row>,
  contract: ModelContract,
  ids: readonly string[],
  includeDeactivated = false
) {
  const rows = await model.findWhere(keyed(contract, ids), 'AND', {
    orderBy: [contract.primaryKey],
    includeDeactivated,
  });
  return rows.map(row => projectRecord(contract, row));
}

/**
 * Does: Reads one page of records after the cursor, in the requested order
 * and filtered, plus the count of all records matching the filter.
 * Called by: the list handler inside the tenant transaction.
 * Why: the page and the count are two statements, so the total is advisory
 * under concurrent writes.
 */
export async function listRecords(
  model: QueryModel<Row>,
  contract: ModelContract,
  request: ListRequest
) {
  request = scopedQuery(contract, request);
  const includeDeactivated = request.archived !== 'exclude';
  const page = await model.findAfterCursor(
    request.cursor ?? {},
    request.size,
    [...request.orderBy],
    {
      descending: request.descending,
      filters: request.filters,
      includeDeactivated,
    }
  );
  const total = await model.countWhere([], 'AND', {
    filters: request.filters,
    includeDeactivated,
  });
  return {
    rows: page.rows.map(row => projectRecord(contract, row)),
    next: page.nextCursor,
    total,
  };
}

/**
 * Does: Reads the records matching a list request, up to its size, in its
 * order, for export.
 * Called by: the export handler inside the tenant transaction.
 */
export async function exportRecords(
  model: QueryModel<Row>,
  contract: ModelContract,
  request: ListRequest
) {
  request = scopedQuery(contract, request);
  const page = await model.findAfterCursor(
    {},
    request.size,
    [...request.orderBy],
    {
      descending: request.descending,
      filters: request.filters,
      includeDeactivated: request.archived !== 'exclude',
    }
  );
  return page.rows.map(row => projectRecord(contract, row));
}

/**
 * Does: Reads one active record by key.
 * Called by: the read handler inside the tenant transaction.
 * Why: a record of another tenant is invisible under row-level security, so
 * it answers exactly like a missing one.
 * @throws HttpError NOT_FOUND when no active record has the key.
 */
export async function readRecord(
  model: QueryModel<Row>,
  id: string,
  contract?: ModelContract
) {
  const row = await model.findById(id);
  if (!row) throw new HttpError('NOT_FOUND');
  contract?.policy?.check(row);
  return contract ? projectRecord(contract, row) : row;
}

/**
 * Does: Inserts one record and returns it as stored.
 * Called by: the create handler inside the tenant transaction.
 */
export async function createRecord(
  model: TableModel<Row>,
  record: Row,
  contract?: ModelContract
) {
  await contract?.policy?.beforeCreate?.(record);
  contract?.policy?.check(record, true);
  contract?.policy?.write(record, record);
  const row = await model.insert(record);
  return contract ? projectRecord(contract, row) : row;
}

/**
 * Does: Inserts many records, one statement per set of columns present, and
 * returns them as stored.
 * Called by: the bulk-insert and import handlers inside the tenant
 * transaction.
 * Why: a multi-row insert needs every record to carry the same columns, and
 * a client may leave an optional column out of some records; grouping keeps
 * the omitted column's default rather than inventing a value, and every
 * group runs inside the one transaction so the batch stays all-or-nothing.
 */
export async function bulkInsertRecords(
  model: TableModel<Row>,
  contract: ModelContract,
  records: Row[]
) {
  for (const row of records) {
    await contract.policy?.beforeCreate?.(row);
    contract.policy?.check(row, true);
    contract.policy?.write(row, row);
  }
  const groups = new Map<string, Row[]>();
  for (const record of records) {
    const key = Object.keys(record).sort().join(',');
    (groups.get(key) ?? groups.set(key, []).get(key))?.push(record);
  }
  const inserted: Row[] = [];
  for (const group of groups.values()) {
    const rows = await model.bulkInsert(group, [...contract.columns]);
    if (Array.isArray(rows)) inserted.push(...rows);
  }
  return inserted.map(row => projectRecord(contract, row));
}

/**
 * Does: Applies one set of changes to every identified active record and
 * returns the records as stored.
 * Called by: the update handler inside the tenant transaction.
 */
export async function updateRecords(
  model: TableModel<Row>,
  contract: ModelContract,
  batch: Identified,
  changes: Row
) {
  await requireAll(model, contract, batch, 'exclude');
  for (const id of batch.ids) {
    const row = await model.findById(id);
    if (row) {
      contract.policy?.check({ ...row, ...changes });
      contract.policy?.write(changes, row);
    }
  }
  await model.updateWhere(keyed(contract, batch.ids), changes);
  return reread(model, contract, batch.ids);
}

/**
 * Does: Applies each record's own changes to the active record it names and
 * returns the records as stored.
 * Called by: the bulk-update handler inside the tenant transaction.
 */
export async function bulkUpdateRecords(
  model: TableModel<Row>,
  contract: ModelContract,
  batch: Identified,
  records: Row[]
) {
  await requireAll(model, contract, batch, 'exclude');
  for (const record of records) {
    const row = await model.findById(String(record[contract.primaryKey]));
    if (row) {
      contract.policy?.check({ ...row, ...record });
      contract.policy?.write(record, row);
    }
  }
  await model.bulkUpdate(records);
  return reread(model, contract, batch.ids);
}

/**
 * Does: Soft-deletes every identified active record and returns the records
 * as stored, with their deactivation time set.
 * Called by: the archive handler inside the tenant transaction.
 */
export async function archiveRecords(
  model: TableModel<Row>,
  contract: ModelContract,
  batch: Identified
) {
  await requireAll(model, contract, batch, 'exclude');
  await model.removeWhere(keyed(contract, batch.ids));
  return reread(model, contract, batch.ids, true);
}

/**
 * Does: Reverses the soft deletion of every identified archived record and
 * returns the records as stored.
 * Called by: the restore handler inside the tenant transaction.
 */
export async function restoreRecords(
  model: TableModel<Row>,
  contract: ModelContract,
  batch: Identified
) {
  await requireAll(model, contract, batch, 'only');
  await model.restoreWhere(keyed(contract, batch.ids));
  return reread(model, contract, batch.ids);
}

/** Does: Validates full records before omitting protected fields. Called by: resource operations before replies. */
function projectRecord(contract: ModelContract, row: Row) {
  if (!contract.policy) return row;
  if (!contract.itemSchema.safeParse(row).success)
    throw new Error('Resource response violates its contract');
  return contract.policy.redact(row);
}
/** Does: Adds scope constraints before pagination and totals. Called by: list and export operations. */
function scopedQuery(
  contract: ModelContract,
  request: ListRequest
): ListRequest {
  if (!contract.policy) return request;
  contract.policy.query([
    ...request.orderBy,
    ...Object.keys(request.filters),
    ...Object.keys(request.cursor ?? {}),
  ]);
  if (Object.keys(contract.policy.filters).length === 0) return request;
  return {
    ...request,
    filters: {
      $and: [
        request.filters as WhereCondition,
        contract.policy.filters as WhereCondition,
      ].filter(condition => Object.keys(condition).length > 0),
    },
  };
}
