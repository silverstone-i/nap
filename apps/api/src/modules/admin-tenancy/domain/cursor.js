/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminAccessError, AdminEventError } from './errors.js';

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

// Microseconds, matching what the model reads back from PostgreSQL. A
// millisecond-precision position would silently skip the rows inside the
// truncated remainder.
const microsecondInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const eventPayloadSchema = z.strictObject({
  v: z.literal(1),
  op: z.literal('listEvents'),
  fingerprint: z.string().length(64),
  after: z.strictObject({
    occurred_at: z.string().regex(microsecondInstant),
    id: z.uuid(),
  }),
});

/**
 * Decode and validate an opaque event-list cursor, and confirm it was issued
 * for this same filter set and authorization scope. `fingerprint` covers both,
 * so a cursor cannot be replayed after widening a filter or against a
 * different reader — the events list has no single subject UUID to bind to the
 * way the membership lists do.
 * @param {unknown} cursor Caller-supplied cursor, or `undefined` for the first page.
 * @param {string} fingerprint Hash of the applied filters and scope conditions.
 * @returns {{occurred_at: string, id: string}|null} The pg-schemata cursor to resume from, or `null` for the first page.
 * @throws {AdminEventError} `INVALID_INPUT`
 */
export function parseEventCursor(cursor, fingerprint) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new AdminEventError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AdminEventError('INVALID_INPUT');
  }
  const result = eventPayloadSchema.safeParse(decoded);
  if (!result.success) throw new AdminEventError('INVALID_INPUT');
  const payload = result.data;
  if (payload.fingerprint !== fingerprint)
    throw new AdminEventError('INVALID_INPUT');
  return payload.after;
}

/**
 * Encode the next event page's cursor. `occurred_at` is the microsecond text
 * the model reads back, which PostgreSQL accepts unchanged as a `timestamptz`
 * parameter.
 * @param {{occurred_at: string, id: string}|null} nextCursor The model's raw cursor, or `null` when there is no next page.
 * @param {string} fingerprint Hash of the applied filters and scope conditions.
 * @returns {string|null}
 */
export function encodeEventCursor(nextCursor, fingerprint) {
  if (!nextCursor) return null;
  const payload = {
    v: 1,
    op: 'listEvents',
    fingerprint,
    after: { occurred_at: nextCursor.occurred_at, id: nextCursor.id },
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}
