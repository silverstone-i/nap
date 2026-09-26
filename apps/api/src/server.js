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
import { createCellRegistry } from './infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from './infrastructure/provisioning/localCells.js';
import { createRenderCellDriver } from './infrastructure/provisioning/renderCells.js';
import { createStages } from './application/provisioning/stages.js';
import { createProvisioningWorker } from './application/provisioning/worker.js';
import { createSyncWorker } from './application/sync/worker.js';

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
  const cells = createCellRegistry({ admin: admin.db });
  const services = [
    { start: () => cells.load(config.cells), stop: () => cells.close() },
  ];
  // I0003-R001: the worker runs in dev and prod, never in test.
  if (config.provisioning) {
    const driver =
      config.environment === 'prod'
        ? createRenderCellDriver(config.provisioning)
        : createLocalCellDriver(config.provisioning);
    const worker = createProvisioningWorker({
      admin,
      driver,
      stages: createStages({
        driver,
        registry: cells,
        environment: config.environment,
      }),
    });
    services.push({ start: () => worker.start(), stop: () => worker.stop() });
  }
  // I0004-R001: the sync worker starts after the cell registry has loaded,
  // in dev and prod, never in test.
  if (config.environment !== 'test') {
    const sync = createSyncWorker({ admin, registry: cells });
    services.push({ start: () => sync.start(), stop: () => sync.stop() });
  }
  runtime = createRuntime(
    { admin, cache },
    {
      trustProxyHops: config.trustProxyHops,
      webRoot: config.webRoot,
      services,
      api: {
        admin,
        environment: config.environment,
        sessionPolicy: config.session,
        authenticationPolicy: config.authentication,
        cookiePolicy: config.cookie,
        applicationOrigin: config.applicationOrigin,
        runtime: cells,
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
