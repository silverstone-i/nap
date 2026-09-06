/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { performance } from 'node:perf_hooks';
import { assertRuntimeRole } from '../db/assertRuntimeRole.js';
import type { Database } from 'pg-schemata';

/**
 * Check both pools freshly, sharing only an outstanding cycle. A deadline kills
 * acquired probe connections. Keep an expired cycle until late acquisitions and
 * queries settle so repeated probes cannot queue more work behind a stuck pool.
 * Pool connectionTimeoutMillis also bounds acquisitions before a client exists.
 */
export function createReadiness(
  handles: readonly Database[],
  timeoutMs = 5000
) {
  let inFlight: Promise<boolean> | undefined;
  let stopped = false;
  let cancel: (() => void) | undefined;

  function check(): Promise<boolean> {
    if (stopped || handles.length !== 2) return Promise.resolve(false);
    if (inFlight) return inFlight;
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    let finish: (ready: boolean) => void = () => {};
    const result = new Promise<boolean>(resolve => {
      finish = resolve;
    });
    inFlight = result;
    cancel = () => {
      controller.abort();
      finish(false);
    };
    const timer = setTimeout(cancel, timeoutMs);
    const work = handles.map(async handle => {
      const connection = await handle.db.connect();
      let released = false;
      function release(kill = false) {
        if (released) return;
        released = true;
        void connection.done(kill);
      }
      function abort() {
        release(true);
      }
      if (controller.signal.aborted) {
        release(true);
        return false;
      }
      controller.signal.addEventListener('abort', abort, { once: true });
      try {
        await assertRuntimeRole(
          {
            transaction: work =>
              connection.tx(async tx => {
                // Socket closure alone need not interrupt a running PostgreSQL query.
                // Local server deadlines survive client disconnect and roll back with
                // this probe transaction, leaving reused application sessions unchanged.
                const remaining = String(
                  Math.max(1, Math.floor(deadline - performance.now()))
                );
                await tx.one(
                  "SELECT set_config('statement_timeout', $1, true), set_config('transaction_timeout', $1, true)",
                  [remaining]
                );
                return work(tx);
              }),
          },
          deadline - performance.now()
        );
        return !controller.signal.aborted;
      } finally {
        controller.signal.removeEventListener('abort', abort);
        release(controller.signal.aborted);
      }
    });
    void Promise.allSettled(work).then(results => {
      clearTimeout(timer);
      finish(
        !stopped &&
          !controller.signal.aborted &&
          results.every(r => r.status === 'fulfilled' && r.value)
      );
      inFlight = undefined;
      cancel = undefined;
    });
    return result;
  }

  /** Stop admitting probes and cancel the current cycle during process shutdown. */
  function stop() {
    stopped = true;
    cancel?.();
  }
  return { check, stop };
}
