/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { setTimeout as delay } from 'node:timers/promises';
import { enqueueTenantSnapshots } from './backfill.js';
import { adminToCell, cellToAdmin } from './directions.js';
import { deliverTenant } from './engine.js';

/** Rows read per outbox per tick (I0004-R002). */
const BATCH = 100;

/**
 * Build the admin-cell sync worker that runs inside the API (I0004-R001).
 *
 * Each tick delivers `admin.outbox` to the cells, then every ready cell's
 * `cell.outbox` to the admin database, one tenant at a time. A failure for
 * one tenant or cell never stops the others (R007). Stopping finishes the
 * tenant being applied and leaves every other row pending (R008).
 * @param {{admin: {db: object}, registry: object, intervalMs?: number}} options
 * @returns {{start: () => Promise<void>, stop: () => Promise<void>, tick: () => Promise<void>, backfill: () => Promise<number>}}
 */
export function createSyncWorker({ admin, registry, intervalMs = 1000 }) {
  const db = admin.db;
  const controller = new AbortController();
  let loop;

  async function each(tenantIds, deliver) {
    for (const tenantId of tenantIds) {
      if (controller.signal.aborted) return;
      await deliver(tenantId).catch(() => {});
    }
  }

  /**
   * One pass over both directions. Errors never escape.
   * @returns {Promise<void>}
   */
  async function tick() {
    const adminTenants = await db.outbox.dueTenants(BATCH).catch(() => []);
    await each(adminTenants, tenantId =>
      deliverTenant({
        admin: db,
        direction: 'admin_to_cell',
        source: db,
        tenantId,
        apply: adminToCell({ admin: db, registry, tenantId }),
      })
    );
    for (const cell of registry.readyCells()) {
      if (controller.signal.aborted) return;
      const cellTenants = await cell.db.outbox
        .dueTenants(BATCH)
        .catch(() => []);
      await each(cellTenants, tenantId =>
        deliverTenant({
          admin: db,
          direction: 'cell_to_admin',
          source: cell.db,
          tenantId,
          apply: cellToAdmin({ admin: db, cellId: cell.id, tenantId }),
        })
      );
    }
  }

  /**
   * Enqueue the current state of every synced row of each assigned tenant
   * (I0004-R019).
   * @returns {Promise<number>} Rows inserted.
   */
  function backfill() {
    return db.tx(tx => enqueueTenantSnapshots(db, { tx }));
  }

  /**
   * Backfill, then tick every `intervalMs` until stopped.
   * @returns {Promise<void>}
   */
  async function start() {
    await backfill();
    loop = (async () => {
      while (!controller.signal.aborted) {
        await tick();
        await delay(intervalMs, undefined, {
          signal: controller.signal,
        }).catch(() => {});
      }
    })();
  }

  /**
   * Stop after the tenant being applied.
   * @returns {Promise<void>}
   */
  async function stop() {
    controller.abort();
    await loop;
  }

  return { start, stop, tick, backfill };
}
