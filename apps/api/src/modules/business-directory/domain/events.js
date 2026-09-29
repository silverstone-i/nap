/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/**
 * Build the `record` step of a directory context (M0005-R025): write a
 * `directory_change` row to `cell.outbox` inside the caller's cell
 * transaction, so the request commits or rolls back with the change.
 *
 * The sync worker (I0004) delivers the row to admin, where it appends the
 * administrative event (M0001-12). Each row carries its own `entity_id`,
 * used as the event's deduplication key, so a redelivery never writes a
 * second event. Details never carry a full tax ID.
 * @param {object} cell Target tenant's cell repository handle.
 * @param {{tenantId: string, actorId: string, sessionId?: string|null, requestId?: string|null}} attribution
 * @returns {(change: import('./shared.js').DirectoryChange, tx: object) => Promise<void>}
 */
export function directoryChangeRecorder(
  cell,
  { tenantId, actorId, sessionId = null, requestId = null }
) {
  return async (change, tx) => {
    await cell.outbox.insert(
      {
        tenant_id: tenantId,
        topic: 'directory_change',
        entity_id: randomUUID(),
        revision: 1,
        payload: {
          tenant_id: tenantId,
          event_key: change.eventKey,
          record_id: change.recordId,
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
