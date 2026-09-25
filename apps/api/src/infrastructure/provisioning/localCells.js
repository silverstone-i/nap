/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  MaintenanceError,
  requireCondition,
} from '../../application/shared/errors.js';
import { endpoint, roleUrl } from '../../application/shared/configuration.js';
import { configureDatabase, verifyDatabase, verifyRoles } from './postgres.js';
import { withState } from './state.js';
import { publishLocalConnection } from './cellConnections.js';
import { using } from '../runtime/adminDatabase.js';

/**
 * The operation marker a job leaves on the database it created (I0003 §5).
 * @param {string} operationId
 * @returns {string}
 */
export const operationMarker = operationId => `nap:${operationId}`;

/**
 * Build the `dev` cell driver: cell databases live on the admin server
 * reached through `SETUP_DATABASE_<ENV>`, using the server's existing
 * `nap-admin` and `nap-app` roles (I0003-R007).
 * @param {{adminPassword: string, appPassword: string, setup: string, stateFile: string, envFile: string}} config `runtimeConfiguration().provisioning` for `dev`.
 * @param {{connect?: typeof using}} [options] Test injection point.
 * @returns {{setup: Function, connection: Function, publish: Function}}
 */
export function createLocalCellDriver(config, { connect = using } = {}) {
  /**
   * The cell's endpoint: the setup server's host and options with the cell's
   * database name.
   * @param {{database_name: string}} cell
   * @returns {string}
   */
  function cellEndpoint(cell) {
    const url = endpoint(config.setup, 'SETUP_DATABASE');
    return `${url.host}/${cell.database_name}${url.search}`;
  }

  /**
   * I0003-R010 step 1 input: the connection the cell's migration and
   * activation use. Locally the passwords are the server-wide role passwords.
   * @param {{cell: {id: string, database_name: string}}} job
   * @returns {Promise<{database: string, endpoint: string, adminPassword: string, appPassword: string}>}
   */
  async function connection({ cell }) {
    return {
      database: cell.database_name,
      endpoint: cellEndpoint(cell),
      adminPassword: config.adminPassword,
      appPassword: config.appPassword,
    };
  }

  /**
   * Create the cell database, or reuse it when it carries this job's marker
   * and is owned by `nap-admin`, then apply and verify the grant contract
   * (I0003-R007, R035, R036).
   *
   * The state file records a create request before it is sent. If a retry
   * finds that request recorded but a database without the marker, the
   * earlier create's outcome is unknown, so the job fails rather than guess.
   * @param {{cell: {id: string, database_name: string}, operationId: string}} job
   * @returns {Promise<{database: string, endpoint: string, adminPassword: string, appPassword: string}>}
   * @throws {MaintenanceError} `TARGET_NOT_OWNED`, `CREATE_OUTCOME_UNKNOWN`, or another setup code.
   */
  async function setup({ cell, operationId }) {
    const database = cell.database_name;
    const marker = operationMarker(operationId);
    await withState(config.stateFile, async (saved, save) => {
      const state = saved ?? { version: 1, cells: {} };
      requireCondition(
        state.version === 1 && state.cells && typeof state.cells === 'object',
        'SETUP_FAILED'
      );
      const entry = state.cells[cell.id];
      await connect(
        roleUrl(config.setup, 'nap-admin', config.adminPassword),
        async pool =>
          pool.task(async db => {
            await db.one('SELECT pg_advisory_lock(hashtext($1))', [database]);
            try {
              await verifyRoles(db);
              const row = await db.oneOrNone(
                `SELECT pg_get_userbyid(datdba) AS owner,
                        shobj_description(oid, 'pg_database') AS marker
                   FROM pg_database WHERE datname=$1`,
                [database]
              );
              if (row) {
                if (row.owner === 'nap-admin' && row.marker === marker) return;
                requireCondition(
                  !(
                    entry?.operationId === operationId && entry.createRequested
                  ),
                  'CREATE_OUTCOME_UNKNOWN'
                );
                throw new MaintenanceError('TARGET_NOT_OWNED');
              }
              state.cells[cell.id] = { operationId, createRequested: true };
              await save(state);
              await db.none('CREATE DATABASE $1:name OWNER "nap-admin"', [
                database,
              ]);
              await db.none('COMMENT ON DATABASE $1:name IS $2', [
                database,
                marker,
              ]);
            } finally {
              await db.one('SELECT pg_advisory_unlock(hashtext($1))', [
                database,
              ]);
            }
          })
      );
      state.cells[cell.id] = { operationId, created: true };
      await save(state);
    });
    const target = await connection({ cell });
    await connect(
      roleUrl(target.endpoint, 'nap-admin', config.adminPassword),
      async db => {
        await configureDatabase(db, database);
        await verifyDatabase(db, database);
      }
    );
    await connect(roleUrl(target.endpoint, 'nap-app', config.appPassword), db =>
      db.one('SELECT 1')
    );
    return target;
  }

  /**
   * Save the cell's endpoint into `CELL_DATABASES_DEV` (I0003-R011).
   * @param {string} cellId
   * @param {{endpoint: string}} cellConnection
   * @returns {Promise<{changed: boolean}>}
   */
  async function publish(cellId, cellConnection) {
    return publishLocalConnection(
      config.envFile,
      cellId,
      cellConnection.endpoint
    );
  }

  return { setup, connection, publish };
}
