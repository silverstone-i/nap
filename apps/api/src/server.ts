/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { authConfiguration } from './util/authConfig.js';
import { createRuntime } from './runtime.js';
import { createAdminDatabase } from './db/admin/index.js';
import { adminRepositories } from './db/admin/repositories.js';
import { createCellDatabase } from './db/cell/index.js';
import { cellRepositories } from './db/cell/repositories.js';
import { logger } from './util/logger.js';
import {
  loadLocalEnvironment,
  resolvePort,
  resolveRuntimeConfiguration,
  resolveTrustProxyHops,
} from './util/env.js';

let runtime: ReturnType<typeof createRuntime> | undefined;

/**
 * Does: Runs the runtime's shutdown, if a runtime exists, and exits the
 * process with the exit code it returns.
 * Called by: the SIGINT and SIGTERM handlers, the listener error handler, and
 * the startup failure path below.
 * Why: shutdown has its own deadlines, so this exits even when a database
 * pool never closes; the exit code is 1 if any step timed out or failed. A
 * failure before the handles exist has nothing to drain, so it exits at once.
 */
function stop(code: number) {
  if (!runtime) {
    process.exit(code);
  }
  void runtime.shutdown(code).then(exitCode => {
    process.exit(exitCode);
  });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
let listenerFailed = false;
try {
  loadLocalEnvironment();
  const auth = authConfiguration();
  const port = resolvePort();
  const configuration = resolveRuntimeConfiguration();
  const trustProxyHops = resolveTrustProxyHops();
  runtime = createRuntime(
    {
      admin: createAdminDatabase(configuration.admin, {
        repositories: adminRepositories,
      }),
      cell: createCellDatabase(configuration.cell, {
        repositories: cellRepositories,
      }),
    },
    { trustProxyHops, auth }
  );
  runtime.server.on('error', () => {
    listenerFailed = true;
    logger.error({ event: 'api.listen_failed' }, 'API failed to listen');
    stop(1);
  });
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
