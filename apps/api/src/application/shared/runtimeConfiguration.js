/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { fileURLToPath } from 'node:url';
import { roleUrl, secret, endpoint } from './configuration.js';
import { MaintenanceError, requireCondition } from './errors.js';

function cacheConfiguration(env, suffix) {
  const enabledSetting = `REDIS_CACHE_ENABLED_${suffix}`;
  const enabledText = env[enabledSetting]?.trim() || 'false';
  requireCondition(
    enabledText === 'true' || enabledText === 'false',
    'INVALID_CONFIGURATION',
    enabledSetting
  );
  const enabled = enabledText === 'true';
  const urlSetting = `REDIS_URL_${suffix}`;
  const namespaceSetting = `REDIS_CACHE_NAMESPACE_${suffix}`;
  const url = env[urlSetting]?.trim();
  const namespace = env[namespaceSetting]?.trim();
  if (enabled) {
    requireCondition(url, 'INVALID_CONFIGURATION', urlSetting);
    try {
      requireCondition(
        ['redis:', 'rediss:'].includes(new URL(url).protocol),
        'INVALID_CONFIGURATION',
        urlSetting
      );
    } catch {
      throw new MaintenanceError('INVALID_CONFIGURATION', urlSetting);
    }
    requireCondition(
      typeof namespace === 'string' &&
        /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(namespace),
      'INVALID_CONFIGURATION',
      namespaceSetting
    );
  }
  return { enabled, url, namespace: namespace || 'nap' };
}

/**
 * Resolve the settings the running API needs from `NODE_ENV` and its
 * `*_DEV`, `*_TEST`, or `*_PROD` variables. Production reads the JSON
 * `ADMIN_DATABASE_PROD` entry and serves the built web client; other
 * environments read the plain endpoint and `NAP_APP_PSWD_*` values.
 * @param {Record<string, string | undefined>} env
 * @returns {{port: number, trustProxyHops: number, admin: string, cache: {enabled: boolean, url: string|undefined, namespace: string}, webRoot: string | undefined}} `admin` is the `nap-app` connection string.
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
export function runtimeConfiguration(env) {
  const suffix = { development: 'DEV', test: 'TEST', production: 'PROD' }[
    env.NODE_ENV ?? 'development'
  ];
  requireCondition(suffix, 'INVALID_CONFIGURATION', 'NODE_ENV');
  const port = Number(env.PORT ?? '3000');
  const hops = env[`TRUST_PROXY_HOPS_${suffix}`];
  const trustProxyHops = Number(
    hops?.trim() || (suffix === 'PROD' ? 'NaN' : '0')
  );
  requireCondition(
    Number.isInteger(port) && port > 0 && port <= 65535,
    'INVALID_CONFIGURATION',
    'PORT'
  );
  requireCondition(
    Number.isInteger(trustProxyHops) &&
      trustProxyHops >= 0 &&
      trustProxyHops <= 16,
    'INVALID_CONFIGURATION',
    `TRUST_PROXY_HOPS_${suffix}`
  );
  let entry;
  if (suffix === 'PROD') {
    try {
      entry = JSON.parse(env.ADMIN_DATABASE_PROD);
      requireCondition(
        entry && typeof entry === 'object',
        'INVALID_CONFIGURATION'
      );
    } catch {
      throw new MaintenanceError(
        'INVALID_CONFIGURATION',
        'ADMIN_DATABASE_PROD'
      );
    }
  } else
    entry = {
      endpoint: env[`ADMIN_DATABASE_${suffix}`],
      appPassword: env[`NAP_APP_PSWD_${suffix}`],
    };
  endpoint(entry.endpoint, `ADMIN_DATABASE_${suffix}`);
  secret(entry.appPassword, `ADMIN_DATABASE_${suffix}`);
  return {
    port,
    trustProxyHops,
    admin: roleUrl(entry.endpoint, 'nap-app', entry.appPassword),
    cache: cacheConfiguration(env, suffix),
    webRoot:
      suffix === 'PROD'
        ? fileURLToPath(new URL('../../../../web/dist/', import.meta.url))
        : undefined,
  };
}
