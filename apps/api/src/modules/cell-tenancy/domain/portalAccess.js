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
  memberType: z.enum(['employee', 'client', 'vendor_contact', 'contact']),
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
 * @param {{tenantId: string, memberId: string, memberType: string, email: string, enabled: boolean, temporaryPassword?: string}} request
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
  const { tenantId, memberId, memberType, email, enabled, temporaryPassword } =
    parsed.data;

  const payload = {
    tenant_id: tenantId,
    member_id: memberId,
    member_type: memberType,
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
