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
 * Own the listener and database shutdown ordering without installing process
 * handlers. The entry point owns signals and final exit; tests use real sockets
 * with short deadlines. Handles are registered before start and never afterward.
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

  /** Verify security and connectivity before allowing the listener to accept work. */
  async function start(port: number) {
    if (stopped) return;
    if (!(await readiness.check())) {
      if (stopped) return;
      throw new Error('Runtime readiness failed');
    }
    if (stopped) return;
    await new Promise<void>((resolve, reject) => {
      function failed() {
        server.removeListener('listening', opened);
        reject(new Error('API failed to listen'));
      }
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

  /** Drain HTTP before pools; terminal deadlines are reported to the entry point. */
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
