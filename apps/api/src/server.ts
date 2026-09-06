/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import pino from 'pino';
import { createApp } from './app.js';
import { loadLocalEnvironment, resolvePort } from './util/env.js';

// This process entry point owns the listener and signal handlers. Keep it
// separate from createApp so importing the app does not start a server.
const logger = pino();
try {
  loadLocalEnvironment();
  const port = resolvePort();
  const server = createApp().listen(port);
  server.on('listening', () => {
    logger.info(`API listening on port:${port}`);
  });
  server.on('error', () => {
    logger.error('API failed to listen');
    process.exitCode = 1;
  });
  // Stop accepting requests before closing existing HTTP connections so the
  // watcher can reuse the port. This scaffold has no in-flight business work to
  // drain; feature delivery must revisit that lifecycle when work is introduced.
  const shutdown = () => {
    server.close(() => {
      process.exitCode = 0;
    });
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  logger.error('Invalid API startup configuration');
  process.exitCode = 1;
}
