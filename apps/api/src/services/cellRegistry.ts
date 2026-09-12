/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { cellRepositories } from '../db/cell/repositories.js';
import type { CellHandle } from '../db/cell/repositories.js';
import type { AdminHandle } from '../db/admin/repositories.js';
import { createReadiness } from './readiness.js';
import { HttpError } from '../util/httpError.js';
import { logger } from '../util/logger.js';

/**
 * Does: Tracks initialized cell pools and independent readiness checks by registered UUID.
 * Called by: startup and database-backed application fixtures.
 */
export function createCellRegistry(
  handles: ReadonlyMap<string, CellHandle>,
  timeoutMs = 5000
) {
  const entries = new Map(
    [...handles].map(([id, handle]) => {
      const relations = Object.keys(cellRepositories).map(name => {
        const model = handle.db[name as keyof typeof cellRepositories];
        return `"${model.schema.dbSchema}"."${model.schema.table}"`;
      });
      const probe = createReadiness([handle], timeoutMs, 1, relations);
      const entry = { handle, probe, ready: false, checked: false };
      return [id, entry] as const;
    })
  );
  let stopped = false;
  let inFlight: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** Does: Probes every database independently without overlapping cycles. Called by: startup and the recovery timer. */
  function check() {
    if (stopped) return Promise.resolve();
    if (inFlight) return inFlight;
    inFlight = Promise.all(
      [...entries].map(async ([id, entry]) => {
        const ready = await entry.probe.check();
        if (stopped) return;
        if (!entry.checked || ready !== entry.ready)
          logger.info({
            event: 'cell.readiness',
            cellId: id,
            state: ready ? 'ready' : 'unavailable',
            category: ready
              ? undefined
              : (entry.probe.failureCategory?.() ?? 'readiness_failed'),
          });
        entry.ready = ready;
        entry.checked = true;
      })
    )
      .then(() => {})
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }
  /** Does: Confirms configured IDs exist centrally, then starts independent recovery probes. Called by: runtime startup before listening. */
  async function start(admin: AdminHandle) {
    for (const id of entries.keys()) {
      if (!(await admin.db.cells.findById(id)))
        throw new Error('Unknown configured cell ID');
    }
    await check();
    if (!stopped && !timer) {
      timer = setInterval(() => {
        void check();
      }, 30000);
      timer.unref();
    }
  }
  /** Does: Returns the ready connection pool for a resolved database UUID. Called by: module dispatch and authorized operator commands. */
  function get(id: string | null | undefined) {
    const entry = id ? entries.get(id) : undefined;
    if (!entry?.ready) throw new HttpError('SERVICE_UNAVAILABLE');
    return entry.handle;
  }
  /** Does: Stops probes while keeping ready handles available during request drain. Called by: runtime shutdown before closing pools. */
  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    for (const entry of entries.values()) entry.probe.stop();
  }
  return {
    handles: new Map(handles) as ReadonlyMap<string, CellHandle>,
    get,
    check,
    start,
    stop,
  };
}
/** Does: Names the initialized connection registry. Used by: runtime, route assembly and operator services. */
export type CellRegistry = ReturnType<typeof createCellRegistry>;
