/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/**
 * Activate every `pending` membership of a login whose temporary password
 * was just replaced (I0008-R012), in the caller's admin transaction. A
 * membership with a `member_id` also becomes ready, so its tenant is
 * selectable (I0008-R011). The revisioned model writes each membership's
 * outbox row, so the cell copies follow.
 * @param {object} db Admin repositories.
 * @param {string} portalUserId
 * @param {{tx: object, requestId?: string|null}} options
 * @returns {Promise<string[]>} Activated membership IDs.
 */
export async function activatePendingMemberships(
  db,
  portalUserId,
  { tx, requestId = null }
) {
  const pending = await db.portal_user_tenants.lockPendingByUser(portalUserId, {
    tx,
  });
  for (const membership of pending) {
    await db.portal_user_tenants.update(
      membership.id,
      { status: 'active', ready: membership.member_id !== null },
      { tx, actorId: portalUserId }
    );
    await db.managed_events.append(
      {
        deduplication_key: randomUUID(),
        target_type: 'membership',
        event_key: 'membership.activated',
        outcome: 'succeeded',
        request_id: requestId,
        actor_id: portalUserId,
        tenant_id: membership.tenant_id,
        target_id: membership.id,
        details: { from_status: 'pending', to_status: 'active' },
      },
      { tx }
    );
  }
  if (pending.length > 0)
    await db.cache_revisions.advance(
      pending.map(membership => ({
        domain: 'membership',
        entity: membership.id,
      })),
      { tx }
    );
  return pending.map(membership => membership.id);
}
