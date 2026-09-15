/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { Resolver } from 'node:dns/promises';
import { isIP } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { using, maintenanceUrl } from './postgres.mjs';
import { ProvisioningError, adminDatabaseName } from './config.mjs';
import { renderClient } from '../../apps/api/dist/services/provisioning/render.mjs';

/**
 * Does: Finds the operator's direct public IPv4 address through DNS.
 * Called by: local production maintenance before granting temporary access.
 * Why: HTTPS IP lookups can report a proxy address that PostgreSQL does not use.
 */
export async function operatorAddress() {
  try {
    const resolver = new Resolver({ timeout: 3000, tries: 2 });
    resolver.setServers(['208.67.222.222']);
    const addresses = await resolver.resolve4('myip.opendns.com');
    if (addresses.length !== 1 || isIP(addresses[0]) !== 4) throw new Error();
    return addresses[0];
  } catch {
    throw new ProvisioningError(
      'Cannot discover direct operator IPv4 address; check DNS access to OpenDNS before retrying'
    );
  }
}

/**
 * Does: Runs an admin maintenance operation with temporary, recoverable Render access.
 * Called by: the CLI for production setup, migration and bootstrap.
 */
export async function maintainProduction(
  command,
  context,
  operation,
  call = renderClient(context.env),
  address = operatorAddress,
  probe = connectionReady
) {
  let entry;
  let path;
  /** Does: Checks service and database identities before network or configuration changes. */
  async function resource() {
    const service = await call(
      `/services/${encodeURIComponent(context.env.RENDER_API_SERVICE_ID)}`
    );
    const database = await call(path);
    if (
      service.ownerId !== context.env.RENDER_WORKSPACE_ID ||
      service.serviceDetails?.region !== context.env.RENDER_REGION ||
      database.owner?.id !== context.env.RENDER_WORKSPACE_ID ||
      database.region !== context.env.RENDER_REGION ||
      database.databaseName !== entry.database ||
      database.databaseUser !==
        `nap_setup_${entry.operationId.replaceAll('-', '')}` ||
      !Array.isArray(database.ipAllowList)
    )
      throw new ProvisioningError(
        'Production maintenance resource identity mismatch'
      );
    return database;
  }
  /** Does: Removes only this operation's saved temporary rule and verifies cleanup. */
  async function cleanup() {
    if (!entry?.maintenanceAccess) return;
    const rule = entry.maintenanceAccess;
    const current = await resource();
    const retained = current.ipAllowList.filter(
      x =>
        !(x.cidrBlock === rule.cidrBlock && x.description === rule.description)
    );
    if (retained.length !== current.ipAllowList.length)
      await call(path, 'PATCH', { ipAllowList: retained });
    const verified = await resource();
    if (
      verified.ipAllowList.some(
        x =>
          x.cidrBlock === rule.cidrBlock && x.description === rule.description
      )
    )
      throw new ProvisioningError(
        'Temporary maintenance access cleanup is pending; retry the same command'
      );
    delete entry.maintenanceAccess;
    await context.save();
  }
  /** Does: Opens a single-address rule after saving its cleanup intent. */
  async function prepare(current, connection) {
    if (entry) return;
    entry = current;
    if (
      !entry?.renderId ||
      (entry.requestedDatabase ?? entry.database) !==
        adminDatabaseName('prod', context.env)
    )
      throw new ProvisioningError(
        'Missing matching production admin setup state'
      );
    path = `/postgres/${encodeURIComponent(entry.renderId)}`;
    await resource();
    await cleanup();
    const ip = await address();
    if (isIP(ip) !== 4)
      throw new ProvisioningError('Invalid operator IPv4 address');
    const rule = {
      cidrBlock: `${ip}/32`,
      description: `NAP maintenance ${entry.operationId}`,
    };
    const currentResource = await resource();
    if (currentResource.ipAllowList.some(x => x.cidrBlock === rule.cidrBlock)) {
      await probe(connection || maintenanceUrl(entry));
      return;
    }
    entry.maintenanceAccess = rule;
    await context.save();
    await call(path, 'PATCH', {
      ipAllowList: [...currentResource.ipAllowList, rule],
    });
    const verified = await resource();
    if (
      !verified.ipAllowList.some(
        x =>
          x.cidrBlock === rule.cidrBlock && x.description === rule.description
      )
    )
      throw new ProvisioningError(
        'Temporary maintenance access was not applied; retry the same command'
      );
    await probe(connection || maintenanceUrl(entry));
  }
  context.prepareMaintenance = prepare;
  let result;
  let failure;
  try {
    if (command.operation !== 'setup') {
      const current = context.state.databases.admin;
      if (!current?.endpoint)
        throw new ProvisioningError(
          'Missing matching production admin setup state'
        );
      const endpoint = new URL(`postgres://${current.endpoint}`);
      endpoint.searchParams.set('sslmode', 'verify-full');
      current.endpoint = endpoint.host + endpoint.pathname + endpoint.search;
      await prepare(current);
      await context.save();
    }
    result = await operation();
  } catch (error) {
    const reason =
      error.code === '28P01'
        ? 'database authentication failed'
        : error.code === '42501'
          ? 'database privileges are insufficient'
          : 'database connection or SQL operation failed';
    failure =
      error instanceof ProvisioningError
        ? error
        : new ProvisioningError(
            `Production ${command.operation}: ${reason}; verify direct network access and saved credentials`
          );
  }
  try {
    await cleanup();
  } catch {
    failure = new ProvisioningError(
      'Temporary maintenance access cleanup failed; saved cleanup intent is retained, retry the same command'
    );
  } finally {
    delete context.prepareMaintenance;
  }
  if (failure) throw failure;
  if (command.operation !== 'setup') await publishAdmin(context, call);
  return result;
}

/**
 * Does: Publishes the admin internal connection and merges its recovery entry into Render secrets.
 * Called by: successful production migration and bootstrap after network cleanup.
 */
export async function publishAdmin(context, call) {
  const entry = context.state.databases.admin;
  const base = `/services/${encodeURIComponent(context.env.RENDER_API_SERVICE_ID)}/env-vars/`;
  const existing = await call(base + 'NAP_PROVISION_STATE_PROD');
  let remote;
  try {
    remote = existing.value
      ? JSON.parse(existing.value)
      : { environment: 'prod', databases: {} };
  } catch {
    throw new ProvisioningError('Invalid remote provisioning state');
  }
  if (
    remote.environment !== 'prod' ||
    !remote.databases ||
    Array.isArray(remote.databases)
  )
    throw new ProvisioningError('Invalid remote provisioning state');
  const previous = remote.databases.admin;
  if (
    previous &&
    [
      'operationId',
      'database',
      'renderId',
      'adminPassword',
      'appPassword',
    ].some(key => previous[key] !== entry[key])
  )
    throw new ProvisioningError(
      'Remote admin provisioning identity or credentials differ'
    );
  const connection = {
    endpoint: entry.runtimeEndpoint,
    appPassword: entry.appPassword,
    adminPassword: entry.adminPassword,
  };
  const published = await call(base + 'ADMIN_DATABASE_PROD');
  if (published.value) {
    let value;
    try {
      value = JSON.parse(published.value);
    } catch {
      throw new ProvisioningError('Invalid remote admin connection');
    }
    if (Object.keys(connection).some(key => value?.[key] !== connection[key]))
      throw new ProvisioningError(
        'Remote admin connection differs from saved setup'
      );
  }
  remote.databases.admin = { ...entry, endpoint: entry.runtimeEndpoint };
  delete remote.databases.admin.maintenanceAccess;
  await call(base + 'NAP_PROVISION_STATE_PROD', 'PUT', {
    value: JSON.stringify(remote),
  });
  await call(base + 'ADMIN_DATABASE_PROD', 'PUT', {
    value: JSON.stringify(connection),
  });
  for (const key of ['RENDER_API_KEY', 'RENDER_API_SERVICE_ID']) {
    const saved = await call(base + key);
    if (saved.value && saved.value !== context.env[key])
      throw new ProvisioningError(
        `Remote ${key} differs; reconcile service configuration before retrying`
      );
    if (!saved.value)
      await call(base + key, 'PUT', { value: context.env[key] });
  }
  const cells = await call(base + 'CELL_DATABASES_PROD');
  if (!cells.value)
    await call(base + 'CELL_DATABASES_PROD', 'PUT', { value: '{}' });
  for (const [key, value] of [
    ['ADMIN_DATABASE_PROD', JSON.stringify(connection)],
    ['NAP_PROVISION_STATE_PROD', JSON.stringify(remote)],
  ])
    if ((await call(base + key)).value !== value)
      throw new ProvisioningError(
        'Production configuration publication could not be verified'
      );
}

/**
 * Does: Probes PostgreSQL with bounded retries while a new access rule propagates.
 * Called by: maintenance access preparation before any database changes.
 */
async function connectionReady(connection) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await using(connection, db => db.one('SELECT 1 AS connected'));
      return;
    } catch (error) {
      if (error.code === '28P01')
        throw new ProvisioningError(
          'Production database authentication failed; preserve and verify saved credentials'
        );
      if (attempt === 9)
        throw new ProvisioningError(
          'Production database connectivity failed after access-rule propagation retries; verify the direct operator route'
        );
      await delay(2000);
    }
  }
}
