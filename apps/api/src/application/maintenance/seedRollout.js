/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  argumentsFor,
  environment,
  localConfiguration,
  productionAdminConnection,
  productionEnvironment,
  roleUrl,
} from '../shared/configuration.js';
import {
  cellDatabasesConfiguration,
  provisioningConfiguration,
} from '../shared/runtimeConfiguration.js';
import { MaintenanceError, requireCondition } from '../shared/errors.js';
import { validateAdminRegistry } from '../../modules/admin.js';
import { validateCellRegistry } from '../../modules/cell.js';
import {
  retryCellProvisioning,
  rolloutReferenceData,
} from '../../modules/admin-tenancy/domain/cells.js';
import { createAdminDatabase } from '../../infrastructure/runtime/adminDatabase.js';
import { createCellRegistry } from '../../infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../infrastructure/provisioning/localCells.js';
import { createRenderCellDriver } from '../../infrastructure/provisioning/renderCells.js';
import { createStages } from '../provisioning/stages.js';
import { createProvisioningWorker } from '../provisioning/worker.js';

/**
 * Load the declared reference seed into every published cell that lacks it,
 * without the API (I0007). The core of `db:seed:rollout`, separated from
 * configuration so tests can supply the worker and registry.
 *
 * It exists because the Napsoft cell can itself be `SEED_MISSING` after a
 * release, and then no operator can select the Napsoft tenant to reach the
 * Cells screen. It uses the same functions as the API: failed `seed` jobs
 * are retried (`retryCellProvisioning`), eligible cells are queued
 * (`rolloutReferenceData`), and the worker's `tick` runs each job. The
 * bootstrap login is the recorded actor.
 * @param {object} db Admin repository handle.
 * @param {{registry: object, worker: {tick: () => Promise<void>}}} context
 *   `registry` must already hold every published cell.
 * @returns {Promise<{status: 'completed'|'failed', declaredVersion: number, completed: string[], failed: {cell: string, code: string}[], skipped: {cell: string, reason: string}[]}>}
 * @throws {MaintenanceError} `BOOTSTRAP_LOGIN_MISSING`.
 */
export async function seedRollout(db, { registry, worker }) {
  const login = await db.portal_users.findBootstrapLogin();
  requireCondition(login, 'BOOTSTRAP_LOGIN_MISSING');
  const authority = { actorId: login.id, granted: true };

  const failedSeeds = await db.cell_provisioning.findWhere(
    { requested_action: 'seed', status: 'failed' },
    'AND',
    { columnWhitelist: ['cell_id'] }
  );
  for (const { cell_id: cell } of failedSeeds)
    await retryCellProvisioning(db, authority, cell);
  const rollout = await rolloutReferenceData(db, authority, {
    runtime: registry,
  });

  const targets = [
    ...failedSeeds.map(row => row.cell_id),
    ...rollout.queued,
    ...rollout.skipped
      .filter(row => row.reason === 'ALREADY_QUEUED')
      .map(row => row.cell),
  ];
  // One tick runs one job; stop once no target is still queued.
  for (let i = 0; i < targets.length; i += 1) await worker.tick();

  const completed = [];
  const failed = [];
  for (const cell of new Set(targets)) {
    const job = await db.cell_provisioning.findOneBy(
      { cell_id: cell },
      { columnWhitelist: ['status', 'failure_code'] }
    );
    if (job?.status === 'completed') completed.push(cell);
    else failed.push({ cell, code: job?.failure_code ?? 'SEED_FAILED' });
  }
  return {
    status: failed.length ? 'failed' : 'completed',
    declaredVersion: registry.seedVersion,
    completed,
    failed,
    skipped: rollout.skipped.filter(row => row.reason !== 'ALREADY_QUEUED'),
  };
}

/**
 * Run the reference-seed rollout for one environment with maintenance
 * credentials: `nap-admin` on the admin database, the published cell map,
 * and the same driver, stages, and worker the API builds in `server.js`.
 *
 * A running API does not see the result until it restarts, because its
 * registry still holds each cell's old readiness.
 * @param {string[]} args CLI arguments, `--env <dev|prod>`.
 * @param {NodeJS.ProcessEnv} [rawEnv=process.env]
 * @returns {Promise<object>} The `seedRollout` result.
 * @throws {MaintenanceError} On invalid input or configuration, or from `seedRollout`.
 */
export async function runSeedRollout(args, rawEnv = process.env) {
  const selected = argumentsFor(args);
  validateAdminRegistry();
  validateCellRegistry();
  const env = environment(
    selected === 'prod'
      ? Object.fromEntries(
          Object.entries(rawEnv).filter(([, value]) => value?.trim())
        )
      : rawEnv
  );
  const merged = selected === 'prod' ? productionEnvironment(env) : env;
  const connection =
    selected === 'prod'
      ? productionAdminConnection(merged)
      : localConfiguration(selected, merged);
  const suffix = selected.toUpperCase();
  const provisioning = provisioningConfiguration(merged, suffix, connection);
  requireCondition(provisioning, 'PROVISIONING_UNAVAILABLE');
  const driver =
    selected === 'prod'
      ? createRenderCellDriver(provisioning)
      : createLocalCellDriver(provisioning);
  const admin = createAdminDatabase(
    roleUrl(connection.endpoint, 'nap-admin', connection.adminPassword)
  );
  const registry = createCellRegistry({ admin: admin.db });
  try {
    await admin.connect();
    await registry.load(
      cellDatabasesConfiguration(merged, suffix, connection.appPassword)
    );
    const worker = createProvisioningWorker({
      admin,
      driver,
      stages: createStages({ driver, registry, environment: selected }),
    });
    return await seedRollout(admin.db, { registry, worker });
  } finally {
    await registry.close();
    await admin.close();
  }
}

/**
 * Command-line wrapper for `runSeedRollout`. Prints one JSON line to stdout
 * on success or to stderr on failure, and sets a nonzero exit code when any
 * cell fails. Output contains codes and identifiers only, never credentials.
 * @param {string[]} [args=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
export async function cli(args = process.argv.slice(2)) {
  try {
    const result = await runSeedRollout(args);
    const line = JSON.stringify({ operation: 'seed-rollout', ...result });
    if (result.status === 'failed') {
      console.error(line);
      process.exitCode = 1;
    } else console.log(line);
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: 'seed-rollout',
        status: 'failed',
        code: error?.code ?? 'DATABASE_OPERATION_FAILED',
        setting: error instanceof MaintenanceError ? error.setting : undefined,
      })
    );
    process.exitCode = 1;
  }
}
