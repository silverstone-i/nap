/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  MaintenanceError,
  requireCondition,
} from '../../application/shared/errors.js';
import { roleUrl } from '../../application/shared/configuration.js';
import {
  configureDatabase,
  prepareProviderRoles,
  verifyDatabase,
} from './postgres.js';
import { renderClient } from './render.js';
import {
  publishRenderConnection,
  renderProvisioningState,
} from './cellConnections.js';
import { using } from '../runtime/adminDatabase.js';

/**
 * The Render database user a job creates its instance with. It carries the
 * operation ID, so it doubles as the instance's operation marker (I0003-R036).
 * @param {string} operationId
 * @returns {string}
 */
export const providerUser = operationId =>
  'nap_setup_' + operationId.replaceAll('-', '');

/**
 * Build the `prod` cell driver: one Render Postgres instance per cell,
 * reached over Render's internal network from the API service
 * (I0003-R007, R011, R013).
 *
 * Instance IDs, the create-request flag, and generated role passwords are
 * saved in `NAP_PROVISION_STATE_PROD` before each step whose outcome could be
 * lost, and reused on retry.
 * @param {{adminPassword: string, render: Record<string, string | undefined>}} config `runtimeConfiguration().provisioning` for `prod`.
 * @param {{call?: Function, wait?: (ms: number) => Promise<void>, providerSetup?: Function, connect?: typeof using}} [options] Test injection points.
 * @returns {{setup: Function, connection: Function, publish: Function}}
 */
export function createRenderCellDriver(config, options = {}) {
  const env = config.render;
  const call = options.call ?? renderClient(env);
  const wait = options.wait ?? delay;
  const providerSetup = options.providerSetup ?? prepareProviderRoles;
  const connect = options.connect ?? using;
  const serviceId = env.RENDER_API_SERVICE_ID;
  const store = renderProvisioningState(call, serviceId);

  async function resource(state, database) {
    const row = await call('/postgres/' + encodeURIComponent(state.renderId));
    requireCondition(
      row?.id === state.renderId &&
        row.databaseName === database &&
        row.databaseUser === providerUser(state.operationId),
      'TARGET_NOT_OWNED'
    );
    return row;
  }

  async function findInstance(name) {
    const matches = [];
    let cursor = '';
    do {
      const page = await call(
        `/postgres?ownerId=${encodeURIComponent(env.RENDER_WORKSPACE_ID)}&name=${encodeURIComponent(name)}&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`
      );
      requireCondition(Array.isArray(page), 'SETUP_FAILED');
      matches.push(...page.map(x => x.postgres).filter(x => x?.name === name));
      cursor = page.length === 100 ? page.at(-1).cursor : '';
    } while (cursor);
    return matches;
  }

  /**
   * @param {{cell: {id: string}}} job
   * @returns {Promise<{database: string, endpoint: string, adminPassword: string, appPassword: string}>}
   * @throws {MaintenanceError} `CONFIGURATION_MISSING` when no saved connection exists.
   */
  async function connection({ cell }) {
    const state = await store.read(cell.id);
    requireCondition(state?.endpoint, 'CONFIGURATION_MISSING');
    return {
      database: state.database,
      endpoint: state.endpoint,
      adminPassword: state.adminPassword,
      appPassword: state.appPassword,
    };
  }

  /**
   * Find or create the cell's Render instance, wait until it is available,
   * create `nap-admin` and `nap-app` in it, and apply the grant contract.
   * @param {{cell: {id: string, database_name: string}, operationId: string, signal?: AbortSignal}} job
   * @returns {Promise<{database: string, endpoint: string, adminPassword: string, appPassword: string}>}
   * @throws {MaintenanceError} `TARGET_NOT_OWNED`, `CREATE_OUTCOME_UNKNOWN`, or another setup code.
   */
  async function setup({ cell, operationId, signal }) {
    const database = cell.database_name;
    const name = `nap-cell-${cell.id}`;
    const saved = await store.read(cell.id);
    const state =
      saved?.operationId === operationId
        ? saved
        : {
            version: 1,
            operationId,
            database,
            adminPassword: randomBytes(32).toString('hex'),
            appPassword: randomBytes(32).toString('hex'),
          };
    requireCondition(state.database === database, 'TARGET_NOT_OWNED');
    await store.save(cell.id, state);

    if (!state.renderId) {
      const matches = await findInstance(name);
      if (matches.length) {
        requireCondition(
          matches.length === 1 &&
            matches[0].databaseUser === providerUser(operationId) &&
            matches[0].databaseName === database,
          'TARGET_NOT_OWNED'
        );
        state.renderId = matches[0].id;
      } else {
        requireCondition(!state.createRequested, 'CREATE_OUTCOME_UNKNOWN');
        state.createRequested = true;
        await store.save(cell.id, state);
        let created;
        try {
          created = await call('/postgres', 'POST', {
            name,
            databaseName: database,
            databaseUser: providerUser(operationId),
            ownerId: env.RENDER_WORKSPACE_ID,
            region: env.RENDER_REGION,
            version: env.RENDER_POSTGRES_VERSION,
            plan: env.RENDER_POSTGRES_PLAN,
            diskSizeGB: Number(env.RENDER_DISK_GB),
            ipAllowList: [],
          });
        } catch (error) {
          // A refusal is a definite answer; anything else leaves the outcome unknown.
          if (error?.code === 'RENDER_REQUEST_REFUSED') {
            state.createRequested = false;
            await store.save(cell.id, state);
            throw new MaintenanceError('SETUP_FAILED');
          }
          throw new MaintenanceError('CREATE_OUTCOME_UNKNOWN');
        }
        requireCondition(
          typeof created?.id === 'string',
          'CREATE_OUTCOME_UNKNOWN'
        );
        state.renderId = created.id;
      }
      await store.save(cell.id, state);
    }

    for (let attempt = 0; ; attempt++) {
      const row = await resource(state, database);
      if (row.status === 'available') break;
      requireCondition(attempt < 119, 'SETUP_FAILED');
      requireCondition(!signal?.aborted, 'STOPPED');
      await wait(5000);
    }

    const info = await call(
      '/postgres/' + encodeURIComponent(state.renderId) + '/connection-info'
    );
    let internal;
    try {
      internal = new URL(info.internalConnectionString);
    } catch {
      throw new MaintenanceError('SETUP_FAILED');
    }
    requireCondition(
      ['postgres:', 'postgresql:'].includes(internal.protocol) &&
        internal.pathname === '/' + database &&
        decodeURIComponent(internal.username) === providerUser(operationId),
      'TARGET_NOT_OWNED'
    );
    state.endpoint = internal.host + internal.pathname + internal.search;
    await store.save(cell.id, state);

    const target = await connection({ cell });
    await providerSetup(internal.href, target);
    await connect(
      roleUrl(target.endpoint, 'nap-admin', target.adminPassword),
      async db => {
        await configureDatabase(db, database);
        await verifyDatabase(db, database);
      }
    );
    await connect(roleUrl(target.endpoint, 'nap-app', target.appPassword), db =>
      db.one('SELECT 1')
    );
    return target;
  }

  /**
   * Save the cell's connection into `CELL_DATABASES_PROD` (I0003-R011).
   * @param {string} cellId
   * @param {{endpoint: string, appPassword: string, adminPassword: string}} cellConnection
   * @returns {Promise<{changed: boolean}>}
   */
  async function publish(cellId, cellConnection) {
    return publishRenderConnection(call, serviceId, cellId, cellConnection);
  }

  return { setup, connection, publish };
}
