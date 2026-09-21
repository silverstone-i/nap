/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file API process entry point. Loads configuration, opens the admin
 * database handle, starts the runtime, and exits on SIGINT or SIGTERM after
 * a drained shutdown. Startup never runs setup or migrations.
 */
import { environment } from './application/shared/configuration.js';
import { runtimeConfiguration } from './application/shared/runtimeConfiguration.js';
import { createRuntime } from './application/runtime/createRuntime.js';
import { createAdminDatabase } from './infrastructure/runtime/adminDatabase.js';
import { createRevisionCache } from './infrastructure/cache/index.js';
import { adminTenancyRoutesV1 } from './modules/admin-tenancy/apiRoutes/v1/index.js';

let runtime;
let admin;
let cache;
async function stop(code = 0) {
  const result = runtime ? await runtime.shutdown(code) : code;
  if (!runtime) await Promise.all([cache?.close(), admin?.close()]);
  process.exit(result);
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  const config = runtimeConfiguration(environment());
  admin = createAdminDatabase(config.admin);
  cache = createRevisionCache({ admin, ...config.cache });
  runtime = createRuntime(
    { admin, cache },
    {
      trustProxyHops: config.trustProxyHops,
      webRoot: config.webRoot,
      api: {
        admin,
        environment: config.environment,
        sessionPolicy: config.session,
        authenticationPolicy: config.authentication,
        cookiePolicy: config.cookie,
        applicationOrigin: config.applicationOrigin,
        registrations: adminTenancyRoutesV1,
      },
    }
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
