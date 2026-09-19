/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import {
  MaintenanceError,
  requireCondition,
} from '../../application/shared/errors.js';
import {
  roleUrl,
  secret,
  endpoint,
} from '../../application/shared/configuration.js';
import { withState } from './state.js';
import {
  prepareProviderRoles,
  configureDatabase,
  verifyDatabase,
} from './postgres.js';
import { using } from '../runtime/adminDatabase.js';
/**
 * Validate the Render settings needed to provision the production admin
 * database.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string | undefined>} The same object.
 * @throws {MaintenanceError} `INVALID_CONFIGURATION`, `INVALID_RENDER_SETTINGS`, or `INVALID_RENDER_STORAGE`.
 */
export function renderSettings(env) {
  for (const key of [
    'RENDER_API_KEY',
    'RENDER_WORKSPACE_ID',
    'RENDER_API_SERVICE_ID',
    'RENDER_REGION',
    'RENDER_POSTGRES_VERSION',
    'RENDER_POSTGRES_PLAN',
    'RENDER_DISK_GB',
  ])
    secret(env[key], key);
  requireCondition(
    /^[a-z][a-z0-9_]{0,62}$/.test(
      env.ADMIN_DATABASE_NAME_PROD ?? 'nap_prod_admin'
    ),
    'INVALID_CONFIGURATION',
    'ADMIN_DATABASE_NAME_PROD'
  );
  requireCondition(
    env.RENDER_POSTGRES_VERSION === '18' &&
      ['oregon', 'ohio', 'virginia', 'frankfurt', 'singapore'].includes(
        env.RENDER_REGION
      ),
    'INVALID_RENDER_SETTINGS'
  );
  const size = Number(env.RENDER_DISK_GB);
  requireCondition(
    Number.isInteger(size) && (size === 1 || (size > 0 && size % 5 === 0)),
    'INVALID_RENDER_STORAGE'
  );
  return env;
}
/**
 * Build a Render REST API caller with bearer authentication, a 30 second
 * timeout, and no redirect following.
 * @param {{RENDER_API_KEY?: string}} env
 * @param {typeof fetch} [request=fetch] Injectable for tests.
 * @returns {(path: string, method?: string, body?: unknown) => Promise<unknown>} Resolves to parsed JSON, or `null` on 204.
 */
export function renderClient(env, request = fetch) {
  return async (path, method = 'GET', body) => {
    let response;
    try {
      response = await request('https://api.render.com/v1' + path, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${env.RENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new MaintenanceError('RENDER_REQUEST_FAILED');
    }
    requireCondition(response.ok, 'RENDER_REQUEST_REFUSED');
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      throw new MaintenanceError('INVALID_RENDER_RESPONSE');
    }
  };
}
/**
 * Discover the operator's public IPv4 address by resolving
 * `myip.opendns.com` against OpenDNS, for a temporary database access rule.
 * @returns {Promise<string>}
 * @throws {MaintenanceError} `OPERATOR_ADDRESS_FAILED`
 */
export async function operatorAddress() {
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 2 });
    resolver.setServers(['208.67.222.222']);
    const values = await resolver.resolve4('myip.opendns.com');
    requireCondition(
      values.length === 1 && isIP(values[0]) === 4,
      'OPERATOR_ADDRESS_FAILED'
    );
    return values[0];
  } catch {
    throw new MaintenanceError('OPERATOR_ADDRESS_FAILED');
  }
}
/**
 * Set up or migrate the production admin database on Render.
 *
 * Under the private state file's lock it reconciles the saved operation
 * identity with the configured service, finds or creates the PostgreSQL
 * resource, waits for it, opens a temporary IP allow-list rule for the
 * operator, runs provider role setup or the supplied migration, publishes
 * `ADMIN_DATABASE_PROD` to the service, and removes its own access rule
 * even on failure. Retries reuse the saved resource and passwords.
 * @param {'setup'|'migrate'} operation
 * @param {Record<string, string | undefined>} env Validated by `renderSettings`.
 * @param {string} stateFile Path of the private provisioning state JSON.
 * @param {(config: object) => Promise<{status: string, database: string}>} migrate Migration runner used for `migrate`.
 * @param {{call?: Function, wait?: Function, address?: Function, providerSetup?: Function, using?: Function}} [options] Test injection points.
 * @returns {Promise<{status: 'created'|'unchanged'|'applied', database: string}>}
 * @throws {MaintenanceError} With `created` and `resourceId` set once a Render resource exists.
 */
export async function runRender(
  operation,
  env,
  stateFile,
  migrate,
  options = {}
) {
  renderSettings(env);
  let configured;
  if (env.ADMIN_DATABASE_PROD?.trim()) {
    try {
      configured = JSON.parse(env.ADMIN_DATABASE_PROD);
      endpoint(configured.endpoint, 'ADMIN_DATABASE_PROD');
      secret(configured.adminPassword, 'ADMIN_DATABASE_PROD');
      secret(configured.appPassword, 'ADMIN_DATABASE_PROD');
    } catch {
      throw new MaintenanceError(
        'INVALID_CONFIGURATION',
        'ADMIN_DATABASE_PROD'
      );
    }
  }
  if (env.SETUP_DATABASE_PROD?.trim())
    endpoint(env.SETUP_DATABASE_PROD, 'SETUP_DATABASE_PROD');
  const call = options.call ?? renderClient(env);
  const wait = options.wait ?? delay;
  const address = options.address ?? operatorAddress;
  const providerSetup = options.providerSetup ?? prepareProviderRoles;
  const connect = options.using ?? using;
  return withState(stateFile, async (saved, save) => {
    const database = env.ADMIN_DATABASE_NAME_PROD ?? 'nap_prod_admin';
    requireCondition(
      saved || operation === 'setup',
      'MISSING_PROVISIONING_STATE'
    );
    requireCondition(!configured || saved, 'MISSING_PROVISIONING_STATE');
    const state = saved ?? {
      version: 1,
      environment: 'prod',
      database,
      operationId: randomUUID(),
      adminPassword: randomBytes(32).toString('hex'),
      appPassword: randomBytes(32).toString('hex'),
      workspace: env.RENDER_WORKSPACE_ID,
      service: env.RENDER_API_SERVICE_ID,
      region: env.RENDER_REGION,
    };
    try {
      requireCondition(
        state.version === 1 &&
          state.environment === 'prod' &&
          state.database === database &&
          state.workspace === env.RENDER_WORKSPACE_ID &&
          state.service === env.RENDER_API_SERVICE_ID &&
          state.region === env.RENDER_REGION &&
          /^[0-9a-f-]{36}$/.test(state.operationId),
        'STATE_IDENTITY_MISMATCH'
      );
      secret(state.adminPassword, 'saved admin password');
      secret(state.appPassword, 'saved app password');
      if (configured)
        requireCondition(
          [state.endpoint, state.runtimeEndpoint].includes(
            configured.endpoint
          ) &&
            configured.adminPassword === state.adminPassword &&
            configured.appPassword === state.appPassword,
          'CONFIGURATION_STATE_MISMATCH'
        );
      if (env.SETUP_DATABASE_PROD?.trim() && state.endpoint)
        requireCondition(
          env.SETUP_DATABASE_PROD === state.endpoint,
          'ENDPOINT_MISMATCH'
        );
      await save(state);
      const servicePath = '/services/' + encodeURIComponent(state.service);
      const service = await call(servicePath);
      requireCondition(
        service.ownerId === state.workspace &&
          service.serviceDetails?.region === state.region,
        'SERVICE_IDENTITY_MISMATCH'
      );
      const providerUser = 'nap_setup_' + state.operationId.replaceAll('-', '');
      if (!state.renderId) {
        let cursor = '';
        const matches = [];
        do {
          const page = await call(
            `/postgres?ownerId=${encodeURIComponent(state.workspace)}&name=${encodeURIComponent(database)}&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`
          );
          requireCondition(Array.isArray(page), 'INVALID_RENDER_RESPONSE');
          matches.push(
            ...page.map(x => x.postgres).filter(x => x?.name === database)
          );
          cursor = page.length === 100 ? page.at(-1).cursor : '';
        } while (cursor);
        if (matches.length) {
          requireCondition(
            matches.length === 1 &&
              matches[0].databaseUser === providerUser &&
              matches[0].databaseName === database &&
              matches[0].region === state.region,
            'RESOURCE_IDENTITY_MISMATCH'
          );
          state.renderId = matches[0].id;
        } else {
          requireCondition(
            !state.creationRequested,
            'CREATION_OUTCOME_UNCERTAIN'
          );
          state.creationRequested = true;
          await save(state);
          const created = await call('/postgres', 'POST', {
            name: database,
            databaseName: database,
            databaseUser: providerUser,
            ownerId: state.workspace,
            region: state.region,
            version: env.RENDER_POSTGRES_VERSION,
            plan: env.RENDER_POSTGRES_PLAN,
            diskSizeGB: Number(env.RENDER_DISK_GB),
            ipAllowList: [],
          });
          requireCondition(
            typeof created.id === 'string',
            'CREATION_OUTCOME_UNCERTAIN'
          );
          state.renderId = created.id;
        }
        await save(state);
      }
      const resourcePath = '/postgres/' + encodeURIComponent(state.renderId);
      const resource = async () => {
        const row = await call(resourcePath);
        requireCondition(
          row.id === state.renderId &&
            row.owner?.id === state.workspace &&
            row.region === state.region &&
            row.databaseName === database &&
            row.databaseUser === providerUser &&
            Array.isArray(row.ipAllowList),
          'RESOURCE_IDENTITY_MISMATCH'
        );
        return row;
      };
      let current;
      for (let attempt = 0; attempt < 120; attempt++) {
        current = await resource();
        if (current.status === 'available') break;
        requireCondition(attempt < 119, 'RESOURCE_NOT_READY');
        await wait(5000);
      }
      const cleanup = async () => {
        if (!state.maintenanceAccess) return;
        const rule = state.maintenanceAccess;
        const row = await resource();
        const retained = row.ipAllowList.filter(
          x =>
            !(
              x.cidrBlock === rule.cidrBlock &&
              x.description === rule.description
            )
        );
        if (retained.length !== row.ipAllowList.length)
          await call(resourcePath, 'PATCH', { ipAllowList: retained });
        const checked = await resource();
        requireCondition(
          !checked.ipAllowList.some(
            x =>
              x.cidrBlock === rule.cidrBlock &&
              x.description === rule.description
          ),
          'MAINTENANCE_CLEANUP_PENDING'
        );
        delete state.maintenanceAccess;
        await save(state);
      };
      let result;
      try {
        await cleanup();
        const info = await call(resourcePath + '/connection-info');
        let external, internal;
        try {
          external = new URL(info.externalConnectionString);
          internal = new URL(info.internalConnectionString);
        } catch {
          throw new MaintenanceError('INVALID_RENDER_CONNECTION');
        }
        requireCondition(
          [external, internal].every(
            u =>
              ['postgres:', 'postgresql:'].includes(u.protocol) &&
              u.pathname === '/' + database &&
              decodeURIComponent(u.username) === providerUser
          ),
          'RESOURCE_CONNECTION_MISMATCH'
        );
        external.searchParams.set('sslmode', 'verify-full');
        const endpoint = external.host + external.pathname + external.search;
        const runtimeEndpoint =
          internal.host + internal.pathname + internal.search;
        requireCondition(
          !state.endpoint || state.endpoint === endpoint,
          'RESOURCE_CONNECTION_MISMATCH'
        );
        if (env.SETUP_DATABASE_PROD?.trim())
          requireCondition(
            env.SETUP_DATABASE_PROD === endpoint,
            'ENDPOINT_MISMATCH'
          );
        state.endpoint = endpoint;
        state.runtimeEndpoint = runtimeEndpoint;
        await save(state);
        const ip = await address();
        requireCondition(isIP(ip) === 4, 'OPERATOR_ADDRESS_FAILED');
        const rule = {
          cidrBlock: ip + '/32',
          description: 'NAP maintenance ' + state.operationId,
        };
        current = await resource();
        if (!current.ipAllowList.some(x => x.cidrBlock === rule.cidrBlock)) {
          state.maintenanceAccess = rule;
          await save(state);
          await call(resourcePath, 'PATCH', {
            ipAllowList: [...current.ipAllowList, rule],
          });
          const verified = await resource();
          requireCondition(
            verified.ipAllowList.some(
              x =>
                x.cidrBlock === rule.cidrBlock &&
                x.description === rule.description
            ),
            'MAINTENANCE_ACCESS_FAILED'
          );
        }
        const config = { ...state, environment: 'prod' };
        if (operation === 'setup') {
          await providerSetup(external.href, config);
          await connect(
            roleUrl(endpoint, 'nap-admin', state.adminPassword),
            async db => {
              await configureDatabase(db, database);
              await verifyDatabase(db, database);
            }
          );
          await connect(roleUrl(endpoint, 'nap-app', state.appPassword), db =>
            db.one('SELECT 1')
          );
          result = {
            status: state.setupComplete ? 'unchanged' : 'created',
            database,
          };
          state.setupComplete = true;
          await save(state);
        } else {
          requireCondition(state.setupComplete, 'SETUP_REQUIRED');
          result = await migrate(config);
        }
        const value = JSON.stringify({
          endpoint: runtimeEndpoint,
          adminPassword: state.adminPassword,
          appPassword: state.appPassword,
        });
        await call(servicePath + '/env-vars/ADMIN_DATABASE_PROD', 'PUT', {
          value,
        });
        const published = await call(
          servicePath + '/env-vars/ADMIN_DATABASE_PROD'
        );
        requireCondition(
          published.value === value,
          'CONFIGURATION_PUBLICATION_FAILED'
        );
      } finally {
        await cleanup();
      }
      return result;
    } catch (error) {
      const safe =
        error instanceof MaintenanceError
          ? error
          : new MaintenanceError('PRODUCTION_OPERATION_FAILED');
      safe.created = state.renderId ? state.database : undefined;
      safe.resourceId = state.renderId;
      throw safe;
    }
  });
}
