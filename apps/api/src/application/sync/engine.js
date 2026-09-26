/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/** A retryable delivery failure (I0004-R031). */
export class SyncFailure extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/** Topic order for applying a tenant's rows (I0004-R005, R009). */
const TOPIC_ORDER = Object.freeze({
  tenant: 0,
  membership: 1,
  entitlement: 2,
  portal_access: 3,
});

/**
 * Keep only the highest pending revision per entity (I0004-R004).
 * @param {object[]} rows
 * @returns {{live: object[], superseded: object[]}}
 */
export function supersede(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.topic}|${row.entity_id}`;
    const held = latest.get(key);
    if (!held || row.revision > held.revision) latest.set(key, row);
  }
  const keep = new Set([...latest.values()]);
  const live = [...keep].sort(
    (a, b) =>
      TOPIC_ORDER[a.topic] - TOPIC_ORDER[b.topic] || a.revision - b.revision
  );
  return { live, superseded: rows.filter(row => !keep.has(row)) };
}

/**
 * Append a sync event outside any delivery transaction. A failure to record
 * never stops delivery.
 * @param {object} admin Admin repository handle.
 * @param {object} event
 * @returns {Promise<void>}
 */
async function record(admin, event) {
  await admin.managed_events
    .append({
      deduplication_key: randomUUID(),
      target_type: 'outbox',
      ...event,
    })
    .catch(() => {});
}

/**
 * Deliver one tenant's pending rows in one direction (I0004-R003–R007).
 *
 * A session-level advisory lock on the admin database, keyed by direction
 * and tenant, keeps two API instances from delivering the same tenant and
 * direction at once; an instance that cannot take it skips the tenant. The
 * source transaction locks the rows, marks superseded ones delivered, and
 * runs `apply`, which commits its own target transaction. The source then
 * records the outcome, so a target commit always precedes `delivered`.
 * @param {object} options
 * @param {object} options.admin Admin repository handle.
 * @param {'admin_to_cell'|'cell_to_admin'} options.direction
 * @param {object} options.source Repository handle holding `outbox`.
 * @param {string} options.tenantId
 * @param {(rows: object[]) => Promise<{delivered: string[], failed: {id: string, code: string}[]}>} options.apply
 *   Throws `SyncFailure` for a retryable failure; any other error is
 *   `DELIVERY_FAILED`.
 * @returns {Promise<'skipped'|'idle'|'delivered'|'retry'>}
 */
export async function deliverTenant({
  admin,
  direction,
  source,
  tenantId,
  apply,
}) {
  const key = `sync:${direction}:${tenantId}`;
  return admin.task(async lock => {
    const { locked } = await lock.one(
      'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked',
      [key]
    );
    if (!locked) return 'skipped';
    try {
      return await deliverLocked({ admin, direction, source, tenantId, apply });
    } finally {
      await lock.one('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
        key,
      ]);
    }
  });
}

async function deliverLocked({ admin, direction, source, tenantId, apply }) {
  let event = null;
  const outcome = await source.tx(async tx => {
    const rows = await source.outbox.lockPending(tenantId, { tx });
    if (rows.length === 0) return 'idle';
    const { live, superseded } = supersede(rows);
    await source.outbox.markDelivered(
      superseded.map(row => row.id),
      { tx }
    );
    const priorAttempts = Math.max(0, ...live.map(row => row.attempts));
    let result;
    try {
      result = await apply(live);
    } catch (error) {
      const code =
        error instanceof SyncFailure ? error.code : 'DELIVERY_FAILED';
      const attempts = await source.outbox.markRetry(
        live.map(row => row.id),
        code,
        { tx }
      );
      if ((attempts - 1) % 10 === 0)
        event = {
          event_key: 'sync.delivery.failed',
          outcome: 'failed',
          tenant_id: tenantId,
          target_id: live[0].entity_id,
          details: { direction, failure_code: code, attempts },
        };
      return 'retry';
    }
    for (const { id, code } of result.failed)
      await source.outbox.markFailed(id, code, { tx });
    await source.outbox.markDelivered(result.delivered, { tx });
    if (priorAttempts > 0)
      event = {
        event_key: 'sync.delivery.recovered',
        outcome: 'succeeded',
        tenant_id: tenantId,
        target_id: live[0].entity_id,
        details: { direction, attempts: priorAttempts },
      };
    return 'delivered';
  });
  if (event) await record(admin, event);
  return outcome;
}
