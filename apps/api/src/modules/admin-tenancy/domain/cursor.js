/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminAccessError } from './errors.js';

const payloadSchema = z.strictObject({
  v: z.literal(1),
  op: z.enum(['listMembershipsByUser', 'listMembershipsByTenant']),
  subject: z.uuid(),
  last: z.uuid(),
});

/**
 * Decode and validate an opaque list cursor, and confirm it was issued for
 * this same list operation and subject — a cursor from `listMembershipsByUser`
 * for a different portal user, or from `listMembershipsByTenant`, is rejected
 * rather than silently reused.
 * @param {unknown} cursor Caller-supplied cursor, or `undefined` for the first page.
 * @param {'listMembershipsByUser'|'listMembershipsByTenant'} op
 * @param {string} subject The portal-user or tenant UUID this list is scoped to.
 * @returns {{id: string}|null} The pg-schemata cursor to resume from, or `null` for the first page.
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
export function parseCursor(cursor, op, subject) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new AdminAccessError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AdminAccessError('INVALID_INPUT');
  }
  const result = payloadSchema.safeParse(decoded);
  if (!result.success) throw new AdminAccessError('INVALID_INPUT');
  const payload = result.data;
  if (payload.op !== op || payload.subject !== subject)
    throw new AdminAccessError('INVALID_INPUT');
  return { id: payload.last };
}

/**
 * Encode the next page's cursor.
 * @param {{id: string}|null} nextCursor pg-schemata's raw cursor, or `null` when there is no next page.
 * @param {'listMembershipsByUser'|'listMembershipsByTenant'} op
 * @param {string} subject The portal-user or tenant UUID this list is scoped to.
 * @returns {string|null}
 */
export function encodeCursor(nextCursor, op, subject) {
  if (!nextCursor) return null;
  const payload = { v: 1, op, subject, last: nextCursor.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
