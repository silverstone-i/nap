/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/**
 * Does: Holds the page size a list request gets when it names none, and the
 * largest page size the API applies.
 * Used by: the framework's list parser, and clients that build list requests.
 * Why: the framework HTTP contract bounds every page; a larger requested size
 * is reduced to the maximum and the applied value is reported in page.size.
 */
export const listPageSize = { default: 50, max: 500 } as const;

/**
 * Does: Holds the most rows one spreadsheet export returns.
 * Used by: the framework's export route.
 * Why: the export answers with the whole result set in one body, so it is
 * bounded the way a page is (framework HTTP contract).
 */
export const exportRowLimit = 5000;

/**
 * Does: Lists the query parameter names a list route reserves for paging,
 * sorting, continuation, and the soft-deletion selector.
 * Used by: the framework's list parser, and the model contract check that
 * refuses a column with one of these names.
 * Why: every other query parameter on a list route is a column filter, so a
 * column named like one of these could never be filtered.
 */
export const listParameterNames = [
  'size',
  'sort',
  'cursor',
  'archived',
] as const;

/**
 * Does: Lists the values of the archived selector: active records only,
 * archived records only, or both.
 * Used by: listQuerySchema, the framework's list parser, and clients.
 */
export const archivedSelectors = ['exclude', 'only', 'include'] as const;

/**
 * Does: Represents one value of the archived selector.
 * Used by: the framework's list parser and clients that build list requests.
 */
export type ArchivedSelector = (typeof archivedSelectors)[number];

/**
 * Does: Matches a sort expression: one or more column names separated by
 * commas, with one optional leading minus that sorts the whole expression
 * descending.
 * Used by: listQuerySchema and the framework's list parser.
 * Why: keyset continuation compares every sort column in one direction, so
 * per-column directions are not offered.
 */
export const sortExpression = /^-?[a-z_][a-z0-9_]*(,[a-z_][a-z0-9_]*)*$/;

/**
 * Does: Describes the reserved query parameters of a list request; other
 * keys pass through so the API can treat them as column filters.
 * Used by: the framework's list parser, and clients that build list requests.
 * Why: size is coerced because query strings are text. The object is loose
 * on purpose: the framework validates the remaining keys against the model's
 * columns, which this package does not know.
 */
export const listQuerySchema = z.looseObject({
  size: z.coerce.number().int().min(1).optional(),
  sort: z.string().regex(sortExpression).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  archived: z.enum(archivedSelectors).default('exclude'),
});

/**
 * Does: Represents the checked reserved parameters of a list request.
 * Used by: the framework's list parser and clients.
 */
export type ListQuery = z.infer<typeof listQuerySchema>;
