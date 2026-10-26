/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import {
  hashPassword,
  parseHashingPolicy,
  parseTemporaryPassword,
} from '../../admin-tenancy/domain/password.js';
import { argon2PolicyFromEnv } from '../../../application/shared/configuration.js';

/** Thrown when a portal-access request is rejected before it is written. */
export class PortalAccessError extends Error {
  /** @param {'INVALID_INPUT'} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const requestSchema = z.strictObject({
  tenantId: z.uuid(),
  memberId: z.uuid(),
  memberType: z.enum([
    'employee',
    'contact',
    'vendor_contact',
    'client_contact',
  ]),
  memberLabel: z.string().max(400).nullable().optional(),
  email: z.email(),
  enabled: z.boolean(),
  temporaryPassword: z.unknown().optional(),
});

/**
 * Ask the admin database to turn a tenant user's portal access on or off
 * (I0004-R020–R023). Runs inside the caller's cell transaction, so the
 * request commits or rolls back with the caller's own change; the sync
 * worker delivers it.
 *
 * The temporary password is hashed here, under the admin hashing policy, and
 * only the hash is written.
 * @param {object} tx The caller's cell transaction (a pg-schemata task, so it
 *   carries the cell models).
 * @param {{tenantId: string, memberId: string, memberType: string, memberLabel?: string|null, email: string, enabled: boolean, temporaryPassword?: string}} request
 * @param {{hashingPolicy?: {memoryKib: number, timeCost: number, parallelism: number}}} [options]
 * @returns {Promise<{revision: number}>}
 * @throws {PortalAccessError} `INVALID_INPUT`
 */
export async function requestPortalAccess(
  tx,
  request,
  { hashingPolicy = argon2PolicyFromEnv(process.env) } = {}
) {
  const parsed = requestSchema.safeParse(request);
  if (!parsed.success) throw new PortalAccessError('INVALID_INPUT');
  const {
    tenantId,
    memberId,
    memberType,
    memberLabel,
    email,
    enabled,
    temporaryPassword,
  } = parsed.data;

  const payload = {
    tenant_id: tenantId,
    member_id: memberId,
    member_type: memberType,
    member_label: memberLabel ?? null,
    email: email.trim().toLowerCase(),
    enabled,
  };
  if (enabled) {
    let plain;
    try {
      plain = parseTemporaryPassword(temporaryPassword);
    } catch {
      throw new PortalAccessError('INVALID_INPUT');
    }
    payload.password_hash = await hashPassword(
      parseHashingPolicy(hashingPolicy),
      plain
    );
  } else if (temporaryPassword !== undefined) {
    throw new PortalAccessError('INVALID_INPUT');
  }

  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `cell.outbox|portal_access|${memberId}`,
  ]);
  const revision = await tx.outbox.nextRevision('portal_access', memberId, {
    tx,
  });
  await tx.outbox.insert(
    {
      tenant_id: tenantId,
      topic: 'portal_access',
      entity_id: memberId,
      revision,
      payload,
    },
    { tx }
  );
  return { revision };
}

const labelSchema = z.strictObject({
  tenantId: z.uuid(),
  memberId: z.uuid(),
  label: z.string().min(1).max(400),
});

/**
 * Ask the admin database to relabel every membership of one party
 * (I0012-R007), in the caller's cell transaction. Admin's change comes back
 * to the cell as a membership copy.
 * @param {object} tx The caller's cell transaction.
 * @param {{tenantId: string, memberId: string, label: string}} request
 * @returns {Promise<{revision: number}>}
 * @throws {PortalAccessError} `INVALID_INPUT`
 */
export async function requestMemberLabel(tx, request) {
  const parsed = labelSchema.safeParse(request);
  if (!parsed.success) throw new PortalAccessError('INVALID_INPUT');
  const { tenantId, memberId, label } = parsed.data;
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `cell.outbox|member_label|${memberId}`,
  ]);
  const revision = await tx.outbox.nextRevision('member_label', memberId, {
    tx,
  });
  await tx.outbox.insert(
    {
      tenant_id: tenantId,
      topic: 'member_label',
      entity_id: memberId,
      revision,
      payload: {
        tenant_id: tenantId,
        member_id: memberId,
        member_label: label,
      },
    },
    { tx }
  );
  return { revision };
}
