/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import {
  archivedSelectors,
  listParameterNames,
  listQuerySchema,
} from '@nap/shared';
import { HttpError } from '../util/httpError.js';
import { fieldError } from '../util/fieldErrors.js';
import { parseAt } from './recordInput.js';
import type { ArchivedSelector } from '@nap/shared';
import type { FiltersInput } from 'pg-schemata';
import type { ModelContract, Row } from './modelContract.js';

/**
 * Does: Represents a checked list request: the applied page size, the sort
 * columns and direction, the soft-deletion selector, the column filters, and
 * the decoded continuation cursor when one was sent.
 * Used by: the list and export handlers and the list operation.
 */
export type ListRequest = {
  readonly size: number;
  readonly sort: string;
  readonly orderBy: readonly string[];
  readonly descending: boolean;
  readonly archived: ArchivedSelector;
  readonly filters: FiltersInput;
  readonly cursor?: Row;
};

const reserved = new Set<string>(listParameterNames);
const cursorSchema = z.strictObject({
  s: z.string(),
  a: z.enum(archivedSelectors),
  k: z.array(z.unknown()),
});

/**
 * Does: Turns a sort expression into the ordered column list and direction,
 * with the primary key appended as the tie-breaker.
 * Called by: parseListQuery.
 * Why: keyset continuation needs a total order, which the primary key
 * guarantees; a column outside the model or repeated is refused.
 */
function parseSort(sort: string, contract: ModelContract) {
  const descending = sort.startsWith('-');
  const names = sort ? (descending ? sort.slice(1) : sort).split(',') : [];
  const orderBy: string[] = [];
  for (const name of names) {
    if (!contract.columns.has(name)) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError('sort', 'Unknown column')
      );
    }
    if (orderBy.includes(name)) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError('sort', 'Repeated column')
      );
    }
    orderBy.push(name);
  }
  if (!orderBy.includes(contract.primaryKey)) orderBy.push(contract.primaryKey);
  return { orderBy, descending };
}

/**
 * Does: Turns the non-reserved query parameters into column filters: a
 * string matches equally, a repeated parameter matches any of its values.
 * Called by: parseListQuery.
 * Why: the framework HTTP contract rejects an unknown column rather than
 * ignoring it, and pg-schemata does not check filter names itself, so this
 * is the only guard before the query is built.
 */
function parseFilters(query: Record<string, unknown>, contract: ModelContract) {
  const filters: FiltersInput = {};
  for (const [key, value] of Object.entries(query)) {
    if (reserved.has(key)) continue;
    if (!contract.columns.has(key)) {
      throw new HttpError('INVALID_INPUT', fieldError(key, 'Unknown column'));
    }
    if (typeof value === 'string') {
      filters[key] = value;
    } else if (
      Array.isArray(value) &&
      value.length > 0 &&
      value.every(item => typeof item === 'string')
    ) {
      filters[key] = { $in: value };
    } else {
      throw new HttpError('INVALID_INPUT', fieldError(key, 'Expected a value'));
    }
  }
  return filters;
}

/**
 * Does: Reads the reserved list parameters and the column filters from a
 * query string and returns the checked list request.
 * Called by: the list and export handlers, with their own size limits.
 * Why: a size above the limit is reduced to it and the applied size is
 * reported back with the results (framework HTTP contract). An archived
 * selector other than exclude is refused on a model without soft deletion.
 * @throws HttpError INVALID_INPUT naming the parameter at fault.
 */
export function parseListQuery(
  query: unknown,
  contract: ModelContract,
  limits: { readonly default: number; readonly max: number }
): ListRequest {
  const parsed = parseAt(listQuerySchema, query);
  const size = Math.min(parsed.size ?? limits.default, limits.max);
  const sort = parsed.sort ?? '';
  const { orderBy, descending } = parseSort(sort, contract);
  if (parsed.archived !== 'exclude' && !contract.softDelete) {
    throw new HttpError(
      'INVALID_INPUT',
      fieldError('archived', 'Not soft-deleted')
    );
  }
  const filters = parseFilters(parsed, contract);
  if (parsed.archived === 'only') filters.deactivated_at = { $ne: null };
  const request = {
    size,
    sort,
    orderBy,
    descending,
    archived: parsed.archived,
    filters,
  };
  return parsed.cursor === undefined
    ? request
    : { ...request, cursor: decodeCursor(parsed.cursor, request, contract) };
}

/**
 * Does: Turns the sort-column values of the last row on a page into the
 * opaque continuation value a client sends back as cursor.
 * Called by: the list handler when a page has a successor.
 * Why: the sort expression and archived selector travel inside so a cursor
 * cannot be replayed against a different ordering. It is not signed: it holds
 * only values of rows the caller already received, and it is only ever used
 * inside the caller's own tenant transaction.
 */
export function encodeCursor(last: Row, request: ListRequest) {
  const cursor = {
    s: request.sort,
    a: request.archived,
    k: request.orderBy.map(column => last[column]),
  };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/**
 * Does: Turns a continuation value back into the keyed sort-column values
 * the keyset query starts after.
 * Called by: parseListQuery when the request carries a cursor.
 * Why: every value is checked against its column's schema so a tampered
 * cursor cannot reach the query as an unexpected type.
 * @throws HttpError INVALID_INPUT under cursor when the value is malformed
 * or belongs to a different sort or selector.
 */
export function decodeCursor(
  value: string,
  request: Omit<ListRequest, 'cursor'>,
  contract: ModelContract
): Row {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(
      'INVALID_INPUT',
      fieldError('cursor', 'Unreadable cursor')
    );
  }
  const parsed = cursorSchema.safeParse(decoded);
  if (
    !parsed.success ||
    parsed.data.s !== request.sort ||
    parsed.data.a !== request.archived ||
    parsed.data.k.length !== request.orderBy.length
  ) {
    throw new HttpError(
      'INVALID_INPUT',
      fieldError('cursor', 'Cursor does not match')
    );
  }
  const cursor: Row = {};
  for (const [index, column] of request.orderBy.entries()) {
    const checked = contract
      .columnSchema(column)
      .safeParse(parsed.data.k[index]);
    if (!checked.success) {
      throw new HttpError(
        'INVALID_INPUT',
        fieldError('cursor', 'Cursor does not match')
      );
    }
    cursor[column] = checked.data;
  }
  return cursor;
}
