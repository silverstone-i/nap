/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { ProvisioningError } from './config.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { using } from './postgres.mjs';

/**
 * Does: Checks that PostgreSQL accepts a read-only query before setup changes roles.
 * Called by: server-side Render provisioning after the provider reports availability.
 */
async function probeDatabase(connection) {
  await using(connection, db => db.one('SELECT 1 AS connected'));
}

/** Does: Reads explicit infrastructure choices with no paid defaults. Called by: production setup before creation. */
export function renderSettings(env) {
  const result = {};
  for (const key of [
    'RENDER_API_KEY',
    'RENDER_WORKSPACE_ID',
    'RENDER_REGION',
    'RENDER_POSTGRES_VERSION',
    'RENDER_POSTGRES_PLAN',
    'RENDER_DISK_GB',
    'RENDER_API_SERVICE_ID',
  ]) {
    if (!env[key]) throw new ProvisioningError(`Required ${key}`);
    result[key] = env[key];
  }
  const size = Number(result.RENDER_DISK_GB);
  if (!Number.isInteger(size) || !(size === 1 || (size > 0 && size % 5 === 0)))
    throw new ProvisioningError('Invalid Render storage');
  return result;
}
/** Does: Sends bounded authenticated requests with redacted errors. Called by: Render setup and activation; tests supply fetch. */
export function renderClient(settings, request = fetch, signal) {
  return async function call(path, method = 'GET', body) {
    let response;
    try {
      response = await request(`https://api.render.com/v1${path}`, {
        method,
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${settings.RENDER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
          : AbortSignal.timeout(30000),
      });
    } catch {
      throw new ProvisioningError(
        'Render request failed or timed out; resume from saved state'
      );
    }
    if (
      response.status === 404 &&
      method === 'GET' &&
      path.includes('/env-vars/')
    )
      return { value: '' };
    if (!response.ok)
      throw new ProvisioningError(
        `Render request refused (${response.status})`
      );
    try {
      return await response.json();
    } catch {
      throw new ProvisioningError('Invalid Render response');
    }
  };
}
/** Does: Creates or reconciles one independently hosted database from saved intent. Called by: production setup. */
export async function provisionRender(
  context,
  entry,
  call,
  wait = delay,
  probe = probeDatabase
) {
  const settings = renderSettings(context.env);
  const service = await call(
    `/services/${encodeURIComponent(settings.RENDER_API_SERVICE_ID)}`
  );
  if (
    service.ownerId !== settings.RENDER_WORKSPACE_ID ||
    service.serviceDetails?.region !== settings.RENDER_REGION
  )
    throw new ProvisioningError(
      'Render API service workspace or region mismatch'
    );
  const user = `nap_setup_${entry.operationId.replaceAll('-', '')}`;
  const admin = context.state?.databases?.admin === entry && !entry.id;
  const requested = entry.requestedDatabase ?? entry.database;
  if (!entry.renderId) {
    let cursor = '';
    const matches = [];
    do {
      const page = await call(
        `/postgres?ownerId=${encodeURIComponent(settings.RENDER_WORKSPACE_ID)}&name=${encodeURIComponent(entry.database)}&limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`
      );
      if (!Array.isArray(page))
        throw new ProvisioningError('Invalid Render database list');
      matches.push(
        ...page.map(x => x.postgres).filter(x => x?.name === entry.database)
      );
      cursor = page.length === 100 ? page.at(-1).cursor : '';
    } while (cursor);
    if (matches.length) {
      if (
        matches.length !== 1 ||
        matches[0].databaseUser !== user ||
        (!admin && matches[0].databaseName !== entry.database) ||
        matches[0].region !== settings.RENDER_REGION
      )
        throw new ProvisioningError(
          'Existing Render database does not match saved provisioning intent'
        );
      entry.renderId = matches[0].id;
      await context.save();
    } else {
      if (entry.renderRequested)
        throw new ProvisioningError(
          'Render creation outcome is uncertain; retry reconciliation later'
        );
      entry.renderRequested = true;
      await context.save();
      const result = await call('/postgres', 'POST', {
        name: entry.database,
        databaseName: entry.database,
        databaseUser: user,
        ownerId: settings.RENDER_WORKSPACE_ID,
        region: settings.RENDER_REGION,
        version: settings.RENDER_POSTGRES_VERSION,
        plan: settings.RENDER_POSTGRES_PLAN,
        diskSizeGB: Number(settings.RENDER_DISK_GB),
      });
      if (!result.id)
        throw new ProvisioningError(
          'Render creation response missing resource ID'
        );
      entry.renderId = result.id;
      await context.save();
    }
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    const resource = await call(
      `/postgres/${encodeURIComponent(entry.renderId)}`
    );
    const recoverName =
      admin &&
      !entry.requestedDatabase &&
      !entry.endpoint &&
      entry.stage === 'registered' &&
      resource.id === entry.renderId &&
      resource.name === requested &&
      /^[a-z][a-z0-9_]{0,62}$/.test(resource.databaseName);
    if (
      (resource.databaseName !== entry.database && !recoverName) ||
      resource.databaseUser !== user ||
      resource.region !== settings.RENDER_REGION ||
      resource.owner?.id !== settings.RENDER_WORKSPACE_ID
    )
      throw new ProvisioningError('Render resource identity mismatch');
    if (resource.status === 'available') {
      const info = await call(
        `/postgres/${encodeURIComponent(entry.renderId)}/connection-info`
      );
      const external = new URL(info.externalConnectionString);
      external.searchParams.set('sslmode', 'verify-full');
      const internal = new URL(info.internalConnectionString);
      if (
        external.pathname !== `/${resource.databaseName}` ||
        internal.pathname !== external.pathname
      )
        throw new ProvisioningError('Render database connection mismatch');
      if (resource.databaseName !== entry.database) {
        entry.requestedDatabase = requested;
        entry.database = resource.databaseName;
      }
      const maintenance = context.api ? internal : external;
      entry.endpoint =
        maintenance.host + maintenance.pathname + maintenance.search;
      entry.runtimeEndpoint =
        internal.host + internal.pathname + internal.search;
      await context.save();
      if (context.api) {
        for (let retry = 0; retry < 10; retry++) {
          if (context.signal?.aborted)
            throw new ProvisioningError(
              'Render database readiness interrupted; retry the same cell'
            );
          try {
            await probe(maintenance.href);
            break;
          } catch (error) {
            const transient =
              [
                'ECONNREFUSED',
                'ECONNRESET',
                'ETIMEDOUT',
                'ENOTFOUND',
                'EAI_AGAIN',
                '57P03',
              ].includes(error.code) ||
              [
                'Connection terminated unexpectedly',
                'Connection terminated due to connection timeout',
                'timeout exceeded when trying to connect',
              ].includes(error.message);
            if (!transient)
              throw new ProvisioningError(
                'Render database readiness check failed; verify provider credentials and database permissions'
              );
            if (retry === 9)
              throw new ProvisioningError(
                'Render database is available but not accepting connections yet; retry the same cell'
              );
            await wait(2000, undefined, { signal: context.signal });
          }
        }
      }
      return maintenance.href;
    }
    await wait(5000, undefined, { signal: context.signal });
  }
  throw new ProvisioningError(
    'Render database is not available yet; rerun setup'
  );
}
/**
 * Does: Reads the latest saved connection variables for a fresh API process.
 * Called by: production startup so save-only changes survive a process restart.
 */
export async function refreshRenderConnections(env) {
  if (
    env.NODE_ENV !== 'production' ||
    !env.RENDER_API_KEY ||
    !env.RENDER_API_SERVICE_ID
  )
    return;
  const call = renderClient(env);
  for (const key of ['ADMIN_DATABASE_PROD', 'CELL_DATABASES_PROD']) {
    const saved = await call(
      `/services/${env.RENDER_API_SERVICE_ID}/env-vars/${key}`
    );
    if (saved?.value) env[key] = saved.value;
  }
}
