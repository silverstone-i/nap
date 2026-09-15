/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { parseDocument } from 'yaml';
import { ProvisioningError, adminDatabaseName } from './config.mjs';
import { renderSettings } from '../../apps/api/dist/services/provisioning/render.mjs';

const blueprintKeys = [
  'RENDER_WORKSPACE_ID',
  'RENDER_REGION',
  'RENDER_POSTGRES_VERSION',
  'RENDER_POSTGRES_PLAN',
  'RENDER_DISK_GB',
];

/**
 * Does: Reads production setup settings from private configuration and Blueprint defaults.
 * Called by: the admin setup CLI before opening its saved state.
 */
export async function productionEnvironment(
  inherited = process.env,
  blueprintFile = new URL('../../render.yaml', import.meta.url)
) {
  const envFile = resolve(
    inherited.NAP_ENV_FILE ||
      fileURLToPath(new URL('../../apps/api/.env', import.meta.url))
  );
  let file = {};
  try {
    file = parseEnv(await readFile(envFile, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new ProvisioningError('Cannot read private setup configuration');
  }
  const env = { ...file, ...inherited, NAP_ENV_FILE: envFile };
  for (const key of blueprintKeys)
    env[key] = inherited[key]?.trim() || file[key]?.trim() || '';

  if (blueprintKeys.some(key => !env[key])) {
    let blueprint;
    try {
      const document = parseDocument(await readFile(blueprintFile, 'utf8'));
      if (document.errors.length) throw new Error();
      blueprint = document.toJS({ maxAliasCount: 0 });
    } catch {
      throw new ProvisioningError(
        'Cannot read render.yaml defaults; provide a valid Blueprint or all five Render defaults in private configuration'
      );
    }
    const services = Array.isArray(blueprint?.services)
      ? blueprint.services.filter(service => service?.type === 'web')
      : [];
    if (services.length !== 1 || !Array.isArray(services[0].envVars))
      throw new ProvisioningError(
        'render.yaml defaults require exactly one web service with envVars'
      );
    for (const key of blueprintKeys) {
      const entries = services[0].envVars.filter(entry => entry?.key === key);
      if (entries.length > 1)
        throw new ProvisioningError(`Duplicate render.yaml setting ${key}`);
      if (!env[key] && entries.length) {
        const entry = entries[0];
        if (
          Object.keys(entry).some(field => !['key', 'value'].includes(field)) ||
          !['string', 'number'].includes(typeof entry.value)
        )
          throw new ProvisioningError(
            `Required literal render.yaml value for ${key}`
          );
        env[key] = String(entry.value).trim();
      }
    }
  }
  const missing = [
    'RENDER_API_KEY',
    ...blueprintKeys,
    'RENDER_API_SERVICE_ID',
  ].filter(key => !env[key]?.trim());
  if (missing.length)
    throw new ProvisioningError(`Required ${missing.join(', ')}`);
  adminDatabaseName('prod', env);
  renderSettings(env);
  return env;
}
