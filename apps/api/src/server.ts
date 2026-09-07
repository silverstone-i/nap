/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createRuntime } from './runtime.js';
import { createAdminDatabase } from './db/admin/index.js';
import { createCellDatabase } from './db/cell/index.js';
import { logger } from './util/logger.js';
import {
  loadLocalEnvironment,
  resolvePort,
  resolveRuntimeConfiguration,
} from './util/env.js';
import type { Database } from 'pg-schemata';

const handles: Database[] = [];
const runtime = createRuntime(handles);

/**
 * Does: Runs the runtime's shutdown and exits the process with the exit code
 * it returns.
 * Called by: the SIGINT and SIGTERM handlers, the listener error handler, and
 * the startup failure path below.
 * Why: shutdown has its own deadlines, so this exits even when a database
 * pool never closes; the exit code is 1 if any step timed out or failed.
 */
function stop(code: number) {
  void runtime.shutdown(code).then(exitCode => {
    process.exit(exitCode);
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
let listenerFailed = false;
runtime.server.on('error', () => {
  listenerFailed = true;
  logger.error({ event: 'api.listen_failed' }, 'API failed to listen');
  stop(1);
});
try {
  loadLocalEnvironment();
  const port = resolvePort();
  const configuration = resolveRuntimeConfiguration();
  handles.push(createAdminDatabase(configuration.admin));
  handles.push(createCellDatabase(configuration.cell));
  await runtime.start(port);
} catch {
  // Listener errors already started shutdown at their boundary.
  if (!listenerFailed) {
    logger.error(
      { event: 'api.startup_failed' },
      'Invalid API startup configuration or unsafe/unavailable database'
    );
  }
  stop(1);
}
