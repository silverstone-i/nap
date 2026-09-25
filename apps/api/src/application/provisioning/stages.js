/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { migrateCell } from '../maintenance/migrateCell.js';
import { cellModules } from '../../modules/cell.js';
import { createCellDatabase } from '../../infrastructure/runtime/cellDatabase.js';
import { roleUrl } from '../shared/configuration.js';
import { MaintenanceError } from '../shared/errors.js';

/**
 * Failure codes a stage may report as-is (I0003 §8). Any other error becomes
 * the stage's default code, so a driver or library message can never carry
 * an endpoint or password into `failure_code` (I0003-R039).
 */
const REPORTED = new Set([
  'SETUP_FAILED',
  'TARGET_NOT_OWNED',
  'CREATE_OUTCOME_UNKNOWN',
  'MIGRATION_FAILED',
  'SEED_FAILED',
  'PUBLISH_CONFLICT',
  'PUBLISH_FAILED',
  'CONFIGURATION_MISSING',
  'CELL_NOT_REGISTERED',
  'CELL_DISABLED',
  'CELL_UNREACHABLE',
  'IDENTITY_MISSING',
  'IDENTITY_MISMATCH',
  'DATABASE_MISMATCH',
  'STOPPED',
]);

/** Thrown by a stage; `code` is always safe to store as `failure_code`. */
export class StageError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Run a stage body and reduce any failure to a reportable code.
 * @param {string} fallback The stage's default failure code.
 * @param {() => Promise<T>} body
 * @returns {Promise<T>}
 * @template T
 */
async function stage(fallback, body) {
  try {
    return await body();
  } catch (error) {
    throw new StageError(REPORTED.has(error?.code) ? error.code : fallback);
  }
}

/**
 * Open a short-lived `nap-admin` handle on the cell (I0003-R038: only the
 * worker uses `nap-admin`).
 * @param {{endpoint: string, adminPassword: string}} target
 * @param {(handle: object) => Promise<T>} operation
 * @param {typeof createCellDatabase} connect
 * @returns {Promise<T>}
 * @template T
 */
async function withCellAdmin(target, operation, connect) {
  const handle = connect(
    roleUrl(target.endpoint, 'nap-admin', target.adminPassword)
  );
  try {
    await handle.connect();
    return await operation(handle);
  } finally {
    await handle.close();
  }
}

/**
 * Build the four provisioning stages over an environment's cell driver
 * (I0003-R007–R010).
 *
 * Each stage is idempotent, so a job returned to `queued` mid-stage, or
 * retried after a failure, reruns from setup and reuses what it already did.
 * @param {{driver: {setup: Function, connection: Function, publish: Function}, registry: {add: Function}, environment: 'dev'|'test'|'prod', modules?: object[], migrate?: typeof migrateCell, connect?: typeof createCellDatabase}} context
 * @returns {{setup: Function, migration: Function, seed: Function, activation: Function}}
 */
export function createStages({
  driver,
  registry,
  environment,
  modules = cellModules,
  migrate = migrateCell,
  connect = createCellDatabase,
}) {
  return {
    /**
     * I0003-R007. Create or reuse the cell database and apply its grants.
     * @param {{cell: object, operationId: string, signal?: AbortSignal}} job
     * @returns {Promise<void>}
     */
    setup: job =>
      stage('SETUP_FAILED', async () => void (await driver.setup(job))),

    /**
     * I0003-R008. Migrate as `nap-admin`, then write or confirm the physical
     * identity row.
     * @param {{cell: {id: string, database_name: string}, operationId: string}} job
     * @returns {Promise<void>}
     */
    migration: job =>
      stage('MIGRATION_FAILED', async () => {
        const target = await driver.connection(job);
        await migrate(target, modules);
        const expected = {
          cell_id: job.cell.id,
          database_name: job.cell.database_name,
          operation_id: job.operationId,
          environment,
        };
        await withCellAdmin(
          target,
          async ({ db }) => {
            const existing = await db.physical_identity.findOneBy(
              {},
              { columnWhitelist: Object.keys(expected) }
            );
            if (!existing) {
              await db.physical_identity.record(expected);
              return;
            }
            for (const [key, value] of Object.entries(expected))
              if (existing[key] !== value)
                throw new MaintenanceError('IDENTITY_MISMATCH');
          },
          connect
        );
      }),

    /**
     * I0003-R009. Run each cell module's `seed(handle)` step; with none
     * registered this does nothing.
     * @param {object} job
     * @returns {Promise<void>}
     */
    seed: job =>
      stage('SEED_FAILED', async () => {
        const seeders = modules.filter(m => typeof m.seed === 'function');
        if (!seeders.length) return;
        const target = await driver.connection(job);
        await withCellAdmin(
          target,
          async handle => {
            for (const m of seeders) await m.seed(handle);
          },
          connect
        );
      }),

    /**
     * I0003-R010 steps 1 and 2: publish the connection, then add the cell to
     * the registry, which runs the readiness checks. Completing the job and
     * root tenant setup are the worker's (steps 3 and 4).
     * @param {{cell: {id: string}}} job
     * @returns {Promise<void>}
     * @throws {StageError} `PUBLISH_CONFLICT`, `PUBLISH_FAILED`, `CONFIGURATION_MISSING`, or the registry's not-ready reason.
     */
    activation: job =>
      stage('PUBLISH_FAILED', async () => {
        const target = await driver.connection(job);
        await driver.publish(job.cell.id, target);
        const readiness = await registry.add(job.cell.id, {
          endpoint: target.endpoint,
          appPassword: target.appPassword,
        });
        if (!readiness.ready) throw new MaintenanceError(readiness.reason);
      }),
  };
}
