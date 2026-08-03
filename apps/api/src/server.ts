/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';
import {
  closeDb,
  initDb,
  probeDb,
  resolveConnectionString,
} from './db/index.js';
import { createLogger, parseLogLevel } from './lib/logger.js';

const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Validated listen port. `listen(NaN)` binds a random port instead of
 * failing, so a malformed PORT must be rejected here.
 *
 * @throws {Error} When PORT is set but not an integer in 1–65535.
 */
function resolvePort(env: NodeJS.ProcessEnv): number {
  const raw = env.PORT ?? '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer in 1–65535, got "${raw}"`);
  }
  return port;
}

// Startup order per RULES/api-server.md: read process.env → initDb() →
// probeDb() → listen(). The probe fails the process rather than letting it
// serve traffic against an unreachable database.
const logger = createLogger(parseLogLevel(process.env.LOG_LEVEL));
const port = resolvePort(process.env);

initDb(resolveConnectionString(process.env), logger);

try {
  await probeDb();
} catch (error) {
  logger.error('Database unreachable at startup; exiting', error);
  closeDb();
  process.exit(1);
}

const server = createApp(logger).listen(port, () => {
  logger.info(`@nap/api listening on port ${port}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
  logger.error(`HTTP server failed on port ${port}`, error);
  closeDb();
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    logger.info(`${signal} received; shutting down`);

    // server.close() waits for in-flight and keep-alive connections; the
    // deadline keeps a lingering client from blocking shutdown forever.
    const deadline = setTimeout(() => {
      logger.warn(
        `Connections still open after ${SHUTDOWN_GRACE_MS}ms; forcing close`
      );
      server.closeAllConnections();
    }, SHUTDOWN_GRACE_MS);
    deadline.unref();

    server.close(() => {
      clearTimeout(deadline);
      closeDb();
      process.exit(0);
    });
  });
}
