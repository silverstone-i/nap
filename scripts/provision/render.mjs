/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { ProvisioningError } from './config.mjs';
import { setTimeout as delay } from 'node:timers/promises';

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
export function renderClient(settings, request = fetch) {
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
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new ProvisioningError(
        'Render request failed or timed out; resume from saved state'
      );
    }
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
export async function provisionRender(context, entry, call, wait = delay) {
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
        matches[0].databaseName !== entry.database ||
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
    if (
      resource.databaseName !== entry.database ||
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
      external.searchParams.set('sslmode', 'require');
      const internal = new URL(info.internalConnectionString);
      if (
        external.pathname !== `/${entry.database}` ||
        internal.pathname !== external.pathname
      )
        throw new ProvisioningError('Render database connection mismatch');
      entry.endpoint = external.host + external.pathname + external.search;
      entry.runtimeEndpoint =
        internal.host + internal.pathname + internal.search;
      await context.save();
      return external.href;
    }
    await wait(5000);
  }
  throw new ProvisioningError(
    'Render database is not available yet; rerun setup'
  );
}
/** Does: Publishes runtime-only connection entries and resumes a deployment. Called by: production activation. */
export async function deployCell(context, entry, call, wait = delay) {
  const service = context.env.RENDER_API_SERVICE_ID;
  if (!/^srv-[a-z0-9]+$/.test(service || ''))
    throw new ProvisioningError('Invalid Render API service ID');
  const selectedService = await call(`/services/${service}`);
  if (
    selectedService.ownerId !== context.env.RENDER_WORKSPACE_ID ||
    selectedService.serviceDetails?.region !== context.env.RENDER_REGION
  )
    throw new ProvisioningError(
      'Render API service workspace or region mismatch'
    );
  const key = 'CELL_DATABASES_PROD';
  if (!entry.deployId) {
    const all = [];
    let cursor = '';
    do {
      const page = await call(
        `/services/${service}/env-vars?limit=100${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`
      );
      all.push(...page);
      cursor = page.length === 100 ? page.at(-1).cursor : '';
    } while (cursor);
    const value = all.find(x => x.envVar?.key === key)?.envVar.value || '{}';
    const map = JSON.parse(value);
    if (!map || Array.isArray(map) || typeof map !== 'object')
      throw new ProvisioningError('Invalid Render cell configuration');
    if (map[entry.id] && map[entry.id].endpoint !== entry.runtimeEndpoint)
      throw new ProvisioningError('Existing runtime cell endpoint differs');
    for (const config of Object.values(map)) {
      if (!config || typeof config !== 'object')
        throw new ProvisioningError('Invalid runtime entry');
      delete config.adminPassword;
    }
    map[entry.id] = {
      endpoint: entry.runtimeEndpoint,
      appPassword: entry.appPassword,
    };
    await call(`/services/${service}/env-vars/${key}`, 'PUT', {
      value: JSON.stringify(map),
    });
    const admin = context.state.databases.admin;
    if (!admin?.runtimeEndpoint)
      throw new ProvisioningError('Missing production admin state');
    await call(`/services/${service}/env-vars/ADMIN_DATABASE_PROD`, 'PUT', {
      value: JSON.stringify({
        endpoint: admin.runtimeEndpoint,
        appPassword: admin.appPassword,
      }),
    });
    if (entry.deployRequested)
      throw new ProvisioningError(
        'Deployment response was uncertain; inspect Render before resetting saved deployment intent'
      );
    entry.deployRequested = true;
    await context.save();
    const result = await call(`/services/${service}/deploys`, 'POST', {});
    if (!result.id) throw new ProvisioningError('Missing deployment ID');
    entry.deployId = result.id;
    await context.save();
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    const deploy = await call(`/services/${service}/deploys/${entry.deployId}`);
    if (deploy.status === 'live') return;
    if (
      ['build_failed', 'update_failed', 'canceled', 'deactivated'].includes(
        deploy.status
      )
    ) {
      delete entry.deployId;
      delete entry.deployRequested;
      await context.save();
      throw new ProvisioningError(
        'Render deployment failed; rerun activation after correcting deployment'
      );
    }
    await wait(5000);
  }
  throw new ProvisioningError('Render deployment pending; rerun activation');
}
