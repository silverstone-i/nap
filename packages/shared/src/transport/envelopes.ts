/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/**
 * Does: Holds the number every API response body carries in its version
 * field.
 * Used by: every transport schema in this package, and the API when it builds
 * a response body.
 * Why: a client rejects a body whose version is not this value, so a change to
 * the envelope shape must change it (ARCH-043).
 */
export const transportVersion = 1;

/**
 * Does: Builds the schema of a successful response that carries one value
 * under data, from the schema of that value.
 * Called by: each contract file that defines a single-value endpoint response,
 * health today, and tests.
 * Why: the envelope is strict at its own level so an unexpected top-level
 * field is rejected on both sides of the boundary (ARCH-043). Strictness of
 * the value is the caller's choice; pass a strict object schema.
 */
export function successResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.strictObject({
    version: z.literal(transportVersion),
    data: dataSchema,
  });
}

/**
 * Does: Describes the page block of a list response: the page size the server
 * applied, the count of records matching the filter, and the opaque value that
 * fetches the next page when one exists.
 * Used by: listResponseSchema, and the API when it builds a list response.
 * Why: the framework HTTP contract requires the applied size and the total to
 * be reported and keyset continuation for traversal. Cursor is absent, never
 * null, on the last page.
 */
export const pageSchema = z.strictObject({
  size: z.int().positive(),
  total: z.int().nonnegative(),
  cursor: z.string().min(1).optional(),
});

/**
 * Does: Builds the schema of a list response, an array of records under data
 * plus the page block, from the schema of one record.
 * Called by: each contract file that defines a list endpoint response, and
 * tests.
 */
export function listResponseSchema<T extends z.ZodType>(itemSchema: T) {
  return z.strictObject({
    version: z.literal(transportVersion),
    data: z.array(itemSchema),
    page: pageSchema,
  });
}

/**
 * Does: Represents the page block of a list response.
 * Used by: API and web code that handles list responses.
 */
export type Page = z.infer<typeof pageSchema>;

/**
 * Does: Represents a successful single-value response body whose data is T.
 * Used by: API handlers building a response and web code adapting one.
 */
export type SuccessResponse<T> = z.infer<
  ReturnType<typeof successResponseSchema<z.ZodType<T>>>
>;

/**
 * Does: Represents a list response body whose records are T.
 * Used by: API handlers building a list response and web code adapting one.
 */
export type ListResponse<T> = z.infer<
  ReturnType<typeof listResponseSchema<z.ZodType<T>>>
>;
