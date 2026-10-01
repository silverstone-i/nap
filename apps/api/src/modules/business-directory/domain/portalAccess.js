/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Portal access on a directory person (I0008).
 *
 * Turning `is_portal_user` on or off, or archiving a person, writes a
 * `portal_access` request into `cell.outbox` in the same transaction
 * (I0004-R020). The sync worker applies it to the admin login and
 * membership, and the membership copy comes back to `cell.tenant_members`.
 * A person's status is read from those two cell tables only (R008).
 */

import { z } from 'zod';
import { requestPortalAccess } from '../../cell-tenancy/domain/portalAccess.js';
import { DirectoryError } from './errors.js';

/** Roles whose holder must keep access (I0008-R005, M0001-08-R008). */
const ADMIN_ROLES = Object.freeze(['tenant_admin', 'platform_admin']);

/** Copy statuses in the order a person's status prefers them. */
const MEMBERSHIP_RANK = Object.freeze({ active: 3, pending: 2, suspended: 1 });

/** Temporary password as M0001-08 allows it: nonempty, at most 128 characters. */
export const temporaryPassword = z.string().min(1).max(128);

/** Status for a record no request has touched and whose flag is off. */
export const PORTAL_OFF = Object.freeze({ status: 'off', failureCode: null });

/**
 * The person's primary email, or null.
 * @param {object} context
 * @param {string} partyId
 * @param {object} tx
 * @returns {Promise<string|null>}
 */
async function primaryEmail(context, partyId, tx) {
  const [row] = await context.cell.contact_methods.rows(
    { party_id: partyId, type: 'email', is_primary: true },
    { tx }
  );
  return row?.value ?? null;
}

/**
 * Write a portal-access request for `person` in the caller's transaction
 * (I0008-R001, R002). Turning access on needs a primary email and a
 * temporary password (R003).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} person `app.people` row joined with its party `kind`.
 * @param {boolean} enabled
 * @param {string|undefined} password Temporary password, required when `enabled`.
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
export async function sendPortalAccess(context, person, enabled, password, tx) {
  const email = await primaryEmail(context, person.party_id, tx);
  if (!email) throw new DirectoryError('INVALID_INPUT');
  if (enabled && password === undefined)
    throw new DirectoryError('INVALID_INPUT');
  await requestPortalAccess(
    tx,
    {
      tenantId: context.tenant.id,
      memberId: person.party_id,
      memberType: person.kind,
      email,
      enabled,
      ...(enabled ? { temporaryPassword: password } : {}),
    },
    context.hashingPolicy ? { hashingPolicy: context.hashingPolicy } : {}
  );
}

/**
 * Refuse turning off `person`'s access, or archiving them, when it is the
 * caller's own login (I0008-R006) or a login holding an administrator role
 * in this tenant (R005).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} person
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_STATE`, `ADMIN_ASSIGNED`
 */
export async function assertCanTurnOff(context, person, tx) {
  const memberships = await context.cell.tenant_members.byMemberIds(
    context.tenant.id,
    [person.party_id],
    { tx }
  );
  const logins = memberships
    .filter(row => row.status !== 'suspended')
    .map(row => row.portal_user_id);
  if (logins.includes(context.actorId))
    throw new DirectoryError('INVALID_STATE');
  for (const code of ADMIN_ROLES) {
    if (code === 'platform_admin' && !context.tenant.isNapsoft) continue;
    const role = await context.cell.roles.lockByCode(context.tenant.id, code, {
      tx,
    });
    if (!role || role.deactivated_at) continue;
    for (const login of logins)
      if (
        await context.cell.role_assignments.lockActive(login, role.id, { tx })
      )
        throw new DirectoryError('ADMIN_ASSIGNED');
  }
}

/**
 * The latest request and best membership copy of each person, keyed by
 * party ID, for `portalStatus`.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string[]} partyIds
 * @param {object} tx
 * @returns {Promise<Map<string, {request: object|null, membership: string|null}>>}
 */
export async function portalFacts(context, partyIds, tx) {
  const facts = new Map(
    partyIds.map(id => [id, { request: null, membership: null }])
  );
  if (partyIds.length === 0) return facts;
  for (const row of await context.cell.outbox.latestByEntities(
    context.tenant.id,
    'portal_access',
    partyIds,
    { tx }
  ))
    facts.get(row.entity_id).request = row;
  for (const row of await context.cell.tenant_members.byMemberIds(
    context.tenant.id,
    partyIds,
    { tx }
  )) {
    const fact = facts.get(row.member_id);
    if (
      (MEMBERSHIP_RANK[row.status] ?? 0) >
      (MEMBERSHIP_RANK[fact.membership] ?? 0)
    )
      fact.membership = row.status;
  }
  return facts;
}

/**
 * A person's portal-access status (I0008-R008). The first matching rule
 * wins.
 * @param {boolean} flag `is_portal_user`.
 * @param {{request: object|null, membership: string|null}|undefined} fact
 * @returns {{status: 'off'|'requested'|'invited'|'on'|'failed', failureCode: string|null}}
 */
export function portalStatus(flag, fact) {
  const request = fact?.request;
  if (request?.status === 'pending')
    return { status: 'requested', failureCode: null };
  if (request?.status === 'failed')
    return { status: 'failed', failureCode: request.failure_code };
  if (!flag) return PORTAL_OFF;
  if (fact?.membership === 'active') return { status: 'on', failureCode: null };
  if (fact?.membership === 'pending')
    return { status: 'invited', failureCode: null };
  return { status: 'requested', failureCode: null };
}
