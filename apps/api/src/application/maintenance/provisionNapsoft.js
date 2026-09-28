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
import { provisioningConfiguration } from '../shared/runtimeConfiguration.js';
import { MaintenanceError, requireCondition } from '../shared/errors.js';
import { validateAdminRegistry } from '../../modules/admin.js';
import { validateCellRegistry } from '../../modules/cell.js';
import {
  databaseName,
  registerCell,
  retryCellProvisioning,
} from '../../modules/admin-tenancy/domain/cells.js';
import { createAdminDatabase } from '../../infrastructure/runtime/adminDatabase.js';
import { createCellRegistry } from '../../infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../infrastructure/provisioning/localCells.js';
import { createRenderCellDriver } from '../../infrastructure/provisioning/renderCells.js';
import { createStages } from '../provisioning/stages.js';
import { createProvisioningWorker } from '../provisioning/worker.js';
import { runNapsoftTenantSetup } from '../provisioning/napsoftTenantSetup.js';

/** Suffix of the first cell, so its database is `nap_<env>_cell_napsoft`. */
export const NAPSOFT_CELL_SUFFIX = 'napsoft';

/**
 * Register and provision the first cell, then run Napsoft tenant setup
 * (I0003-R042). The core of `db:provision:napsoft`, separated from
 * configuration so tests can supply the worker.
 *
 * Refuses once the Napsoft tenant has a cell: every later cell uses the API.
 * Registration and the job run go through the same functions the API and
 * the in-process worker use (`registerCell`, `retryCellProvisioning`, the
 * worker's `tick`). The bootstrap login is the recorded actor. A rerun after
 * a failure resumes the same cell: a failed job is retried, a queued one run.
 * @param {object} db Admin repository handle.
 * @param {{environment: 'dev'|'test'|'prod', worker: {tick: () => Promise<void>}, driver: object, napsoftSetup?: typeof runNapsoftTenantSetup}} context
 * @returns {Promise<{status: 'provisioned', cell: string, database: string, tenant: string}>}
 * @throws {MaintenanceError} `NAPSOFT_TENANT_MISSING`, `BOOTSTRAP_LOGIN_MISSING`, `NAPSOFT_CELL_EXISTS`, `INVALID_STATE`, the job's failure code, or `NAPSOFT_SETUP_FAILED`.
 */
export async function provisionNapsoft(
  db,
  { environment: target, worker, driver, napsoftSetup = runNapsoftTenantSetup }
) {
  const napsoft = await db.tenants.findOneBy(
    { is_napsoft: true },
    { columnWhitelist: ['id', 'cell_id'] }
  );
  requireCondition(napsoft, 'NAPSOFT_TENANT_MISSING');
  requireCondition(!napsoft.cell_id, 'NAPSOFT_CELL_EXISTS');
  const login = await db.portal_users.findBootstrapLogin();
  requireCondition(login, 'BOOTSTRAP_LOGIN_MISSING');
  const authority = { actorId: login.id, granted: true };

  const name = databaseName(target, NAPSOFT_CELL_SUFFIX);
  let cell = await db.tx(tx =>
    db.cells.findActiveByIdentity(target, name, { tx })
  );
  if (!cell) {
    cell = (
      await registerCell(db, target, authority, {
        operation: 'cell',
        suffix: NAPSOFT_CELL_SUFFIX,
      })
    ).cell;
  } else {
    const job = await db.cell_provisioning.findOneBy(
      { cell_id: cell.id },
      { columnWhitelist: ['status'] }
    );
    if (job?.status === 'failed')
      await retryCellProvisioning(db, authority, cell.id);
    else requireCondition(job?.status === 'queued', 'INVALID_STATE');
  }

  await worker.tick();
  const job = await db.cell_provisioning.findOneBy(
    { cell_id: cell.id },
    { columnWhitelist: ['status', 'failure_code'] }
  );
  if (job?.status !== 'completed')
    throw new MaintenanceError(job?.failure_code ?? 'SETUP_FAILED');
  // The worker already attempted setup after the job; this call reports its
  // outcome, and retries it once if that attempt failed.
  await napsoftSetup(db, driver);
  const tenant = await db.tenants.findOneBy(
    { id: napsoft.id },
    { columnWhitelist: ['cell_id', 'provisioned', 'rbac_ready'] }
  );
  requireCondition(
    tenant.cell_id === cell.id && tenant.provisioned && tenant.rbac_ready,
    'NAPSOFT_SETUP_FAILED'
  );
  return {
    status: 'provisioned',
    cell: cell.id,
    database: name,
    tenant: napsoft.id,
  };
}

/**
 * Provision the Napsoft cell for one environment with maintenance
 * credentials (I0003-R042): `nap-admin` on the admin database, and the same
 * cell driver, stages, and worker the API builds in `server.js`.
 *
 * `test` has no provisioning configuration (I0003-R001) and is refused with
 * `PROVISIONING_UNAVAILABLE`.
 * @param {string[]} args CLI arguments, `--env <dev|test|prod>`.
 * @param {NodeJS.ProcessEnv} [rawEnv=process.env]
 * @returns {Promise<{status: 'provisioned', cell: string, database: string, tenant: string}>}
 * @throws {MaintenanceError} On invalid input or configuration, or from `provisionNapsoft`.
 */
export async function runProvisionNapsoft(args, rawEnv = process.env) {
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
  const provisioning = provisioningConfiguration(
    merged,
    selected.toUpperCase(),
    connection
  );
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
    const worker = createProvisioningWorker({
      admin,
      driver,
      stages: createStages({ driver, registry, environment: selected }),
    });
    return await provisionNapsoft(admin.db, {
      environment: selected,
      worker,
      driver,
    });
  } finally {
    await registry.close();
    await admin.close();
  }
}

/**
 * Command-line wrapper for `runProvisionNapsoft`. Prints one JSON line to
 * stdout on success or to stderr on failure, and sets a nonzero exit code on
 * failure. Output contains codes and identifiers only, never credentials.
 * @param {string[]} [args=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
export async function cli(args = process.argv.slice(2)) {
  try {
    const result = await runProvisionNapsoft(args);
    console.log(JSON.stringify({ operation: 'provision-napsoft', ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: 'provision-napsoft',
        status: 'failed',
        code: error?.code ?? 'DATABASE_OPERATION_FAILED',
        setting: error instanceof MaintenanceError ? error.setting : undefined,
      })
    );
    process.exitCode = 1;
  }
}
