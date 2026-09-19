/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { environment } from './application/shared/configuration.js';
import { runtimeConfiguration } from './application/shared/runtimeConfiguration.js';
import { createRuntime } from './application/runtime/createRuntime.js';
import { createAdminDatabase } from './infrastructure/runtime/adminDatabase.js';

let runtime;
let admin;
async function stop(code = 0) {
  const result = runtime ? await runtime.shutdown(code) : code;
  if (!runtime) await admin?.close();
  process.exit(result);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  const config = runtimeConfiguration(environment());
  admin = createAdminDatabase(config.admin);
  runtime = createRuntime(
    { admin },
    { trustProxyHops: config.trustProxyHops, webRoot: config.webRoot }
  );
  await runtime.start(config.port);
  runtime.server.on('error', () => {
    console.error('API listener failed');
    void stop(1);
  });
  console.log(`NAP BFF listening on port ${config.port}`);
} catch {
  console.error(
    'API startup failed; verify configuration, web build, and Admin database readiness'
  );
  await stop(1);
}
