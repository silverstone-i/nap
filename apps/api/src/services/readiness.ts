/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { performance } from 'node:perf_hooks';
import { assertRuntimeRole } from '../db/assertRuntimeRole.js';
import type { Database } from 'pg-schemata';

/**
 * Does: Builds a checker that reports whether the configured databases are reachable
 * and running as a safe role, as a check function and a stop function.
 * Called by: createRuntime, which uses it before opening the listener and
 * for the readiness endpoint, and by readiness integration tests.
 * Why: one check cycle runs at a time; callers arriving during a cycle share
 * its result instead of starting more probes. A cycle that hits its deadline
 * answers "not ready" and destroys the connections it took, and stays shared
 * until that work settles, so a stuck database cannot pile up probe work.
 * The pool's own connection timeout bounds the wait for a connection before
 * a client exists.
 */
export function createReadiness(
  handles: readonly Database[],
  timeoutMs = 5000,
  expectedHandles = 2,
  relations: readonly string[] = []
): {
  check: () => Promise<boolean>;
  stop: () => void;
  failureCategory?: () => string | undefined;
} {
  let failure: string | undefined;
  let inFlight: Promise<boolean> | undefined;
  let stopped = false;
  let cancel: (() => void) | undefined;

  /**
   * Does: Runs one readiness cycle, or joins the one in progress, and
   * resolves to true only when all configured databases pass within the deadline.
   * Called by: createRuntime at startup and on each readiness request.
   */
  function check(): Promise<boolean> {
    if (stopped || handles.length !== expectedHandles)
      return Promise.resolve(false);
    if (inFlight) return inFlight;
    failure = undefined;
    const controller = new AbortController();
    const deadline = performance.now() + timeoutMs;
    let finish: (ready: boolean) => void = () => {};
    const result = new Promise<boolean>(resolve => {
      finish = resolve;
    });
    inFlight = result;
    cancel = () => {
      failure = stopped ? 'stopped' : 'timeout';
      controller.abort();
      finish(false);
    };
    const timer = setTimeout(cancel, timeoutMs);
    const work = handles.map(async handle => {
      const connection = await handle.db.connect().catch(() => {
        failure ??= 'connection';
        throw new Error('Readiness connection failed');
      });
      let released = false;
      /** Does: Releases the probe connection once; kill destroys it instead. */
      function release(kill = false) {
        if (released) return;
        released = true;
        void connection.done(kill);
      }
      /** Does: Destroys the probe connection when the cycle is cancelled. */
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
                if (relations.length) {
                  const result = await tx.one<{ ready: boolean }>(
                    `SELECT bool_and(to_regclass(name) IS NOT NULL AND
                      COALESCE(has_table_privilege(to_regclass(name), 'SELECT'), false)) AS ready
                     FROM unnest($1::text[]) AS name`,
                    [relations]
                  );
                  if (!result.ready) {
                    failure = 'required_relations';
                    throw new Error('Required relations unavailable');
                  }
                }
                return work(tx);
              }),
          },
          deadline - performance.now()
        );
        return !controller.signal.aborted;
      } catch {
        failure ??= 'runtime_role';
        return false;
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

  /**
   * Does: Makes every future check answer "not ready" and cancels the cycle
   * in progress.
   * Called by: the runtime's shutdown.
   */
  function stop() {
    stopped = true;
    cancel?.();
  }
  /** Does: Returns a fixed diagnostic category without driver details or credentials. Called by: cell readiness transition logging. */
  function failureCategory() {
    return failure;
  }
  return { check, stop, failureCategory };
}
