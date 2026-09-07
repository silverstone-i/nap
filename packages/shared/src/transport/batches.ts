/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/**
 * Does: Holds the most records or identifiers one batch write accepts.
 * Used by: the batch body schemas below, and clients that split large writes.
 * Why: a batch is all-or-nothing inside one transaction (framework HTTP
 * contract), so its size is bounded; 500 records also fits the API's JSON
 * body ceiling for ordinary records.
 */
export const batchLimit = 500;

/**
 * Does: Describes one record identifier as sent by a client.
 * Used by: idsBodySchema, and the bulk-update body.
 */
export const identifierSchema = z.string().min(1).max(128);

const ids = z
  .array(identifierSchema)
  .min(1)
  .max(batchLimit)
  .refine(values => new Set(values).size === values.length, {
    message: 'Duplicate identifier',
  });

/**
 * Does: Describes the body of an archive or restore request: the identifiers
 * of the records to change.
 * Used by: the framework's archive and restore routes, and clients.
 * Why: duplicates are refused so the count of affected records matches the
 * count of identifiers sent.
 */
export const idsBodySchema = z.strictObject({ ids });

/**
 * Does: Represents the body of an archive or restore request.
 * Used by: the framework's archive and restore routes, and clients.
 */
export type IdsBody = z.infer<typeof idsBodySchema>;

/**
 * Does: Builds the schema of a bulk-insert body, an array of records under
 * records, from the schema of one record.
 * Called by: the framework's bulk-insert and import routes, and clients.
 */
export function bulkInsertBodySchema<T extends z.ZodType>(record: T) {
  return z.strictObject({ records: z.array(record).min(1).max(batchLimit) });
}

/**
 * Does: Builds the schema of an update body, the identifiers of the records
 * to change and one set of changes applied to all of them, from the schema of
 * the changes.
 * Called by: the framework's update route, and clients.
 */
export function updateBodySchema<T extends z.ZodType>(changes: T) {
  return z.strictObject({ ids, changes });
}

/**
 * Does: Builds the schema of a bulk-update body, an array of records each
 * carrying its identifier and its own changes, from the schema of one such
 * record.
 * Called by: the framework's bulk-update route, and clients.
 */
export function bulkUpdateBodySchema<T extends z.ZodType>(record: T) {
  return z.strictObject({ records: z.array(record).min(1).max(batchLimit) });
}
