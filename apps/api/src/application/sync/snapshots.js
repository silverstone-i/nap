/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

const MEMBER_TYPE = z.enum(['employee', 'client', 'vendor_contact', 'contact']);
const TIMESTAMP = z.union([z.string(), z.date()]).nullable();

/** Snapshot shape per topic (I0004-R013, R023). Extra fields are rejected. */
const SNAPSHOTS = Object.freeze({
  tenant: z.strictObject({
    id: z.uuid(),
    tenant_code: z.string().min(1).max(32),
    status: z.enum(['pending', 'active', 'suspended']),
    deactivated_at: TIMESTAMP,
  }),
  membership: z.strictObject({
    id: z.uuid(),
    tenant_id: z.uuid(),
    portal_user_id: z.uuid(),
    member_type: MEMBER_TYPE.nullable(),
    member_id: z.uuid().nullable(),
    status: z.enum(['pending', 'active', 'suspended']),
    deactivated_at: TIMESTAMP,
  }),
  entitlement: z.strictObject({
    id: z.uuid(),
    tenant_id: z.uuid(),
    module: z.string().min(1),
    enabled: z.boolean(),
  }),
  portal_access: z.union([
    z.strictObject({
      tenant_id: z.uuid(),
      member_id: z.uuid(),
      member_type: MEMBER_TYPE,
      email: z.email(),
      enabled: z.literal(true),
      password_hash: z.string().startsWith('$argon2'),
    }),
    z.strictObject({
      tenant_id: z.uuid(),
      member_id: z.uuid(),
      member_type: MEMBER_TYPE,
      email: z.email(),
      enabled: z.literal(false),
    }),
  ]),
});

/**
 * Parse an outbox row's snapshot for its topic.
 * @param {string} topic
 * @param {unknown} payload
 * @returns {object|null} The snapshot, or `null` when it is invalid
 *   (`INVALID_PAYLOAD`, I0004-R032).
 */
export function parseSnapshot(topic, payload) {
  const schema = SNAPSHOTS[topic];
  if (!schema) return null;
  const result = schema.safeParse(payload);
  return result.success ? result.data : null;
}
