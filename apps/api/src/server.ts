/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import pino from 'pino';
import { createApp } from './app.js';
import { loadLocalEnvironment, resolvePort } from './util/env.js';

const logger = pino();
try {
  loadLocalEnvironment();
  const server = createApp().listen(resolvePort());
  server.on('listening', () => {
    logger.info('API listening');
  });
  server.on('error', () => {
    logger.error('API failed to listen');
    process.exitCode = 1;
  });
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
