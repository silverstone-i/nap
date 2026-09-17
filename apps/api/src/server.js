/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';
import { statSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const environmentFile = new URL('../.env', import.meta.url);
if (statSync(environmentFile, { throwIfNoEntry: false }))
  loadEnvFile(environmentFile);

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535');

const server = createApp().listen(port, () => {
  console.log(`NAP API listening on port ${port}`);
});

function shutdown(signal) {
  console.log(`NAP API received ${signal}; shutting down`);
  server.close(error => {
    if (error) {
      console.error('NAP API failed to shut down cleanly');
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
