/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { fileURLToPath } from 'node:url';
import { roleUrl, secret, endpoint } from './configuration.js';
import { MaintenanceError, requireCondition } from './errors.js';

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
    webRoot:
      suffix === 'PROD'
        ? fileURLToPath(new URL('../../../../web/dist/', import.meta.url))
        : undefined,
  };
}
