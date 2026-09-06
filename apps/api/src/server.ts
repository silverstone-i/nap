/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import pino from 'pino';
import { createApp } from './app.js';
import { createAdminDatabase } from './db/admin/index.js';
import { createCellDatabase } from './db/cell/index.js';
import { assertRuntimeRole } from './db/assertRuntimeRole.js';
import {
  loadLocalEnvironment,
  resolvePort,
  resolveRuntimeConfiguration,
} from './util/env.js';
import type { Database } from 'pg-schemata';
import type { Server } from 'node:http';

const logger = pino();
const handles: Database[] = [];
let server: Server | undefined;
let stopping: Promise<void> | undefined;

/** Stop HTTP first, then release every pool even if one pool fails to close. */
function shutdown(code: number): Promise<void> {
  if (stopping) return stopping;
  stopping = (async () => {
    if (server?.listening) {
      await new Promise<void>(resolve => {
        server!.close(() => resolve());
        server!.closeAllConnections();
      });
    }
    const results = await Promise.allSettled(
      handles.map(handle => handle.close())
    );
    process.exitCode = results.some(r => r.status === 'rejected') ? 1 : code;
  })();
  return stopping;
}

process.once('SIGINT', () => {
  void shutdown(0);
});
process.once('SIGTERM', () => {
  void shutdown(0);
});
try {
  loadLocalEnvironment();
  const port = resolvePort();
  const configuration = resolveRuntimeConfiguration();
  handles.push(createAdminDatabase(configuration.admin));
  handles.push(createCellDatabase(configuration.cell));
  for (const handle of handles) {
    if (stopping) break;
    await handle.connect();
    await assertRuntimeRole(handle);
  }
  if (!stopping) {
    server = createApp().listen(port);
    server.once('listening', () =>
      logger.info(`API listening on port:${port}`)
    );
    server.once('error', () => {
      logger.error('API failed to listen');
      void shutdown(1);
    });
  }
} catch {
  logger.error(
    'Invalid API startup configuration or unsafe/unavailable database'
  );
  await shutdown(1);
}
