/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import { DirectoryError } from './errors.js';

const payloadSchema = z.strictObject({
  v: z.literal(1),
  op: z.literal('listRecords'),
  fingerprint: z.string().length(64),
  after: z.uuid(),
});

/**
 * Hash the conditions a page was issued under, so a cursor cannot be
 * replayed against a widened filter or another collection.
 * @param {object} conditions
 * @returns {string}
 */
export function fingerprint(conditions) {
  return createHash('sha256').update(JSON.stringify(conditions)).digest('hex');
}

/**
 * Decode a directory list cursor (M0005-R027) and confirm it was issued for
 * the same filters. It carries only the last row's party ID; the model reads
 * that row's sort keys, so no name appears in a URL.
 * @param {unknown} cursor Caller-supplied cursor, or `undefined` for the first page.
 * @param {string} expected Fingerprint of the applied filters.
 * @returns {string|null} The party ID to resume after.
 * @throws {DirectoryError} `INVALID_INPUT`
 */
export function parseCursor(cursor, expected) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new DirectoryError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new DirectoryError('INVALID_INPUT');
  }
  const result = payloadSchema.safeParse(decoded);
  if (!result.success || result.data.fingerprint !== expected)
    throw new DirectoryError('INVALID_INPUT');
  return result.data.after;
}

/**
 * Encode the next page's cursor.
 * @param {string|null} after Party ID of the page's last row, or `null` when there is no next page.
 * @param {string} issued Fingerprint of the applied filters.
 * @returns {string|null}
 */
export function encodeCursor(after, issued) {
  if (!after) return null;
  return Buffer.from(
    JSON.stringify({ v: 1, op: 'listRecords', fingerprint: issued, after })
  ).toString('base64url');
}
