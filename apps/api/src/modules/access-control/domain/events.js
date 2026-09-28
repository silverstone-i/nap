/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/**
 * Build the `record` step of an access-control context (M0003-R015): write a
 * `role_change` row to `cell.outbox` inside the caller's cell transaction, so
 * the request commits or rolls back with the change itself.
 *
 * The sync worker (I0004) delivers the row to admin, where it appends the
 * administrative event (M0001-12) and advances the tenant's `roles` cache
 * revision (M0001-11) in one admin transaction. Each row carries its own
 * `entity_id`, used as the event's deduplication key, so a redelivery never
 * writes a second event and no change supersedes another.
 * @param {object} cell Target tenant's cell repository handle.
 * @param {{tenantId: string, actorId: string, sessionId?: string|null, requestId?: string|null}} attribution
 * @returns {(change: import('./roles.js').RoleChange, tx: object) => Promise<void>}
 */
export function roleChangeRecorder(
  cell,
  { tenantId, actorId, sessionId = null, requestId = null }
) {
  return async (change, tx) => {
    await cell.outbox.insert(
      {
        tenant_id: tenantId,
        topic: 'role_change',
        entity_id: randomUUID(),
        revision: 1,
        payload: {
          tenant_id: tenantId,
          event_key: change.eventKey,
          role_id: change.roleId,
          actor_id: actorId,
          session_id: sessionId,
          request_id: requestId,
          details: change.details,
        },
      },
      { tx }
    );
  };
}
