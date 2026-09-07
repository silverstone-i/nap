/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createReadiness } from './services/readiness.js';
import { logger } from './util/logger.js';
import type { Database } from 'pg-schemata';

/**
 * Does: Creates the HTTP server and returns start and shutdown functions
 * for it, given the database connections it depends on.
 * Called by: the server entry point at startup, and by runtime tests with
 * short deadlines and real sockets.
 * Why: start refuses to listen until every database passes a readiness
 * check. Shutdown drains HTTP connections before closing database pools so
 * in-flight requests finish against open connections. This function installs
 * no signal handlers and never exits the process; the entry point owns both.
 * All database handles are supplied here; none can be added after start.
 */
export function createRuntime(
  handles: readonly Database[],
  { readinessMs = 5000, drainMs = 10000, poolCloseMs = 5000 } = {}
) {
  const readiness = createReadiness(handles, readinessMs);
  let stopping: Promise<number> | undefined;
  let stopped = false;
  let listening = false;
  const server = createServer(
    createApp(async () => {
      if (stopped || !listening) return false;
      return readiness.check();
    })
  );

  server.on('request', (_request, response) => {
    response.once('finish', () => {
      // close() closes connections idle at invocation; drain keep-alive sockets
      // that become idle later, after Node has finished its response bookkeeping.
      if (stopped) setImmediate(() => server.closeIdleConnections());
    });
  });

  /**
   * Does: Checks that both databases are reachable and running as a safe
   * role, then opens the HTTP listener on the given port.
   * Called by: the server entry point once at startup, and runtime tests.
   * Why: refusing to listen until readiness passes means a misconfigured or
   * over-privileged database fails startup instead of serving requests. If
   * shutdown has already begun, this returns without doing anything.
   * @throws If readiness fails or the port cannot be bound.
   */
  async function start(port: number) {
    if (stopped) return;
    if (!(await readiness.check())) {
      if (stopped) return;
      throw new Error('Runtime readiness failed');
    }
    if (stopped) return;
    await new Promise<void>((resolve, reject) => {
      /** Does: Rejects the listen promise when the server fails to listen. */
      function failed() {
        server.removeListener('listening', opened);
        reject(new Error('API failed to listen'));
      }
      /** Does: Marks the server listening and resolves the listen promise. */
      function opened() {
        server.removeListener('error', failed);
        listening = true;
        resolve();
      }
      server.once('error', failed);
      server.once('listening', opened);
      server.listen(port);
    });
    if (!stopped) logger.info({ event: 'api.started' }, 'API listening');
  }

  /**
   * Does: Stops accepting requests, waits for in-flight requests to finish,
   * closes every database pool, and returns the exit code to use.
   * Called by: the server entry point on SIGINT, SIGTERM, or startup failure,
   * and by runtime tests.
   * Why: HTTP drains before pools close so a request in progress never loses
   * its database connection. Each stage has a deadline; if either expires, or
   * any pool fails to close, the exit code is 1 so the entry point reports
   * it. Repeated calls return the same promise.
   */
  function shutdown(code = 0): Promise<number> {
    if (stopping) return stopping;
    stopped = true;
    listening = false;
    readiness.stop();
    stopping = (async () => {
      logger.info({ event: 'api.stopping' });
      let failed = code !== 0;
      if (server.listening) {
        await new Promise<void>(resolve => {
          const timer = setTimeout(() => {
            failed = true;
            server.closeAllConnections();
            resolve();
          }, drainMs);
          server.close(error => {
            clearTimeout(timer);
            if (error) failed = true;
            resolve();
          });
        });
      }
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          failed = true;
          resolve();
        }, poolCloseMs);
        void Promise.allSettled(
          handles.map(handle => Promise.resolve().then(() => handle.close()))
        ).then(results => {
          clearTimeout(timer);
          if (results.some(result => result.status === 'rejected'))
            failed = true;
          resolve();
        });
      });
      const exitCode = failed ? 1 : 0;
      logger[failed ? 'error' : 'info']({ event: 'api.stopped', exitCode });
      return exitCode;
    })();
    return stopping;
  }
  return { start, shutdown, server };
}
