/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

const MEMBER_TYPE = z.enum([
  'employee',
  'contact',
  'vendor_contact',
  'client_contact',
]);
const TIMESTAMP = z.union([z.string(), z.date()]).nullable();
// I0012-R007: the party label; optional so rows queued before it existed
// still apply.
const MEMBER_LABEL = z.string().max(400).nullable().optional();
// I0013-R007: the tenant's names.
const TENANT_NAME = z.string().min(1).max(160);
const DECISION = {
  request_revision: z.number().int().positive(),
  status: z.enum(['approved', 'rejected']),
  reason: z.string().min(1).max(500).nullable(),
};

/** A tax ID encrypted for a Napsoft client (I0013-R022). */
const CLIENT_TAX_ID = {
  tax_id_format_id: z.uuid(),
  tax_id_encrypted: z.string().min(1),
  tax_id_hash: z.string().min(1),
  tax_id_last4: z.string().regex(/^[0-9A-Z]{4}$/),
};

/** An approval's client and its tax ID. */
const CLIENT_FIELDS = {
  client_id: z.uuid().optional(),
  client_tax_id: z.strictObject(CLIENT_TAX_ID).optional(),
};

/** Snapshot shape per topic (I0004-R013, R023). Extra fields are rejected. */
const SNAPSHOTS = Object.freeze({
  tenant: z.strictObject({
    id: z.uuid(),
    tenant_code: z.string().min(1).max(32),
    status: z.enum(['pending', 'active', 'suspended']),
    name: TENANT_NAME,
    legal_name: TENANT_NAME,
    dba_name: TENANT_NAME.nullable(),
    deactivated_at: TIMESTAMP,
  }),
  membership: z.strictObject({
    id: z.uuid(),
    tenant_id: z.uuid(),
    portal_user_id: z.uuid(),
    member_type: MEMBER_TYPE.nullable(),
    member_id: z.uuid().nullable(),
    member_label: MEMBER_LABEL,
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
      member_label: MEMBER_LABEL,
      email: z.email(),
      enabled: z.literal(true),
      password_hash: z.string().startsWith('$argon2'),
    }),
    z.strictObject({
      tenant_id: z.uuid(),
      member_id: z.uuid(),
      member_type: MEMBER_TYPE,
      member_label: MEMBER_LABEL,
      email: z.email(),
      enabled: z.literal(false),
    }),
  ]),
  // I0012-R007: a party's new label after its organization is renamed.
  member_label: z.strictObject({
    tenant_id: z.uuid(),
    member_id: z.uuid(),
    member_label: z.string().max(400),
  }),
  // M0003-R015: one role, grant, or assignment change. `details` is checked
  // against the event key's registered fields when the event is appended.
  role_change: z.strictObject({
    tenant_id: z.uuid(),
    event_key: z.enum([
      'role.created',
      'role.updated',
      'role.archived',
      'role.restored',
      'role.granted',
      'role.revoked',
      'role.held',
      'role.released',
    ]),
    role_id: z.uuid(),
    actor_id: z.uuid(),
    session_id: z.uuid().nullable(),
    request_id: z.uuid().nullable(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  // M0005-R025: one directory change. The event key and `details` are
  // checked against the event catalogue before the event is appended.
  directory_change: z.strictObject({
    tenant_id: z.uuid(),
    event_key: z.string().regex(/^directory\.[a-z_]+\.[a-z_]+$/),
    record_id: z.uuid(),
    actor_id: z.uuid(),
    session_id: z.uuid().nullable(),
    request_id: z.uuid().nullable(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  // M0006-01: one tenant settings change, checked against the event
  // catalogue like a directory change.
  settings_change: z.strictObject({
    tenant_id: z.uuid(),
    event_key: z.string().regex(/^tenant_settings\.[a-z_]+$/),
    record_id: z.uuid(),
    actor_id: z.uuid(),
    session_id: z.uuid().nullable(),
    request_id: z.uuid().nullable(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  }),
  // I0014-R026: a customer tenant's designation holder as it now stands. No designations
  // removes the employee from Napsoft's copy.
  tenant_contact: z.strictObject({
    tenant_id: z.uuid(),
    party_id: z.uuid(),
    first_name: z.string().min(1).max(160),
    last_name: z.string().min(1).max(160),
    email: z.string().max(320).nullable(),
    phone: z.string().max(32).nullable(),
    designations: z
      .array(z.enum(['primary', 'billing', 'notifications']))
      .max(3),
  }),
  // I0013-R006: Napsoft renamed the client of `target_tenant_id`.
  client_name: z.strictObject({
    tenant_id: z.uuid(),
    target_tenant_id: z.uuid(),
    legal_name: z.string().min(1).max(160),
    dba_name: z.string().min(1).max(160).nullable(),
  }),
  // I0013-R019: the tax ID a customer tenant submitted, encrypted.
  tax_id_request: z.strictObject({
    tenant_id: z.uuid(),
    tax_id_encrypted: z.string().min(1),
    tax_id_last4: z.string().regex(/^[0-9A-Z]{4}$/),
    country: z.string().regex(/^[A-Z]{2}$/),
  }),
  // I0013-R022–R024: Napsoft's decision on request `request_revision`. The
  // Napsoft cell's row names `target_tenant_id`; admin's row to the
  // tenant's cell does not. An approval carries the client and its tax ID
  // through to the tenant's cell, which confirms it with `tax_id_applied`.
  tax_id_decision: z.union([
    z.strictObject({
      tenant_id: z.uuid(),
      target_tenant_id: z.uuid(),
      ...DECISION,
      ...CLIENT_FIELDS,
    }),
    z.strictObject({ tenant_id: z.uuid(), ...DECISION, ...CLIENT_FIELDS }),
  ]),
  // I0013-R024: the tenant's cell applied an approval, so its Napsoft
  // client may take the tax ID.
  tax_id_applied: z.strictObject({
    tenant_id: z.uuid(),
    request_revision: z.number().int().positive(),
    client_id: z.uuid(),
    client_tax_id: z.strictObject(CLIENT_TAX_ID),
  }),
  // I0013-R022: an approved tax ID for a Napsoft client, sent once the
  // tenant's cell has applied the approval.
  client_tax_id: z.strictObject({
    tenant_id: z.uuid(),
    client_id: z.uuid(),
    ...CLIENT_TAX_ID,
  }),
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
