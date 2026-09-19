/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createServer } from 'node:http';
import { createApp } from '../../app.js';
import { checkAdminReadiness } from '../../infrastructure/runtime/adminReadiness.js';

/**
 * Create the HTTP runtime around the Express app.
 *
 * `start` connects the admin handle, requires a passing readiness check,
 * then listens. `shutdown` stops accepting connections, drains in-flight
 * requests for up to `drainMs`, closes the pool within `poolCloseMs`, and
 * resolves to the process exit code. Readiness checks are shared while one
 * is in flight and report not ready once shutdown begins.
 * @param {{admin: import('pg-schemata').Database, cache?: {close: () => Promise<void>}}} handles
 * @param {object} [options]
 * @param {number} [options.trustProxyHops=0]
 * @param {string} [options.webRoot]
 * @param {number} [options.drainMs=10000]
 * @param {number} [options.poolCloseMs=5000]
 * @returns {{server: import('node:http').Server, start: (port: number, host?: string) => Promise<void>, shutdown: (code?: number) => Promise<number>}}
 */
export function createRuntime(
  handles,
  { trustProxyHops = 0, webRoot, drainMs = 10000, poolCloseMs = 5000 } = {}
) {
  let stopped = false;
  let stopping;
  let listening = false;
  let checking;
  function ready() {
    if (stopped) return Promise.resolve(false);
    if (!checking)
      checking = checkAdminReadiness(handles.admin).finally(() => {
        checking = undefined;
      });
    return checking;
  }
  const server = createServer(
    createApp({
      webRoot,
      trustProxyHops,
      isReady: () => (listening && !stopped ? ready() : false),
    })
  );
  server.on('request', (_request, response) =>
    response.once('finish', () => {
      if (stopped) setImmediate(() => server.closeIdleConnections());
    })
  );
  async function start(port, host) {
    try {
      await handles.admin.connect();
      if (stopped) return;
      if (!(await ready()))
        throw new Error('Admin database is unavailable or unsafe');
      if (stopped) return;
      await new Promise((resolve, reject) => {
        const failed = () => {
          server.removeListener('listening', opened);
          reject(new Error('API failed to listen'));
        };
        const opened = () => {
          server.removeListener('error', failed);
          listening = true;
          resolve();
        };
        server.once('error', failed);
        server.once('listening', opened);
        server.listen(port, host);
      });
    } catch (error) {
      await shutdown(1);
      throw error;
    }
  }
  function shutdown(code = 0) {
    if (stopping) return stopping;
    stopped = true;
    listening = false;
    stopping = (async () => {
      let failed = code !== 0;
      if (server.listening)
        await new Promise(resolve => {
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
      await new Promise(resolve => {
        const timer = setTimeout(() => {
          failed = true;
          resolve();
        }, poolCloseMs);
        Promise.all([
          Promise.resolve().then(() => handles.cache?.close()),
          Promise.resolve().then(() => handles.admin.close()),
        ])
          .catch(() => {
            failed = true;
          })
          .finally(() => {
            clearTimeout(timer);
            resolve();
          });
      });
      return failed ? 1 : 0;
    })();
    return stopping;
  }
  return { server, start, shutdown };
}
