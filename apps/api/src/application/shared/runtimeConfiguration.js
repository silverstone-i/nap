/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { fileURLToPath } from 'node:url';
import {
  roleUrl,
  secret,
  endpoint,
  argon2PolicyFromEnv,
} from './configuration.js';
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

function cellConfiguration(env, suffix) {
  const setting = `CELL_DATABASES_${suffix}`;
  let configured;
  try {
    configured = JSON.parse(env[setting]?.trim() || '{}');
  } catch {
    throw new MaintenanceError('INVALID_CONFIGURATION', setting);
  }
  requireCondition(
    configured && typeof configured === 'object' && !Array.isArray(configured),
    'INVALID_CONFIGURATION',
    setting
  );
  const cells = {};
  for (const [id, value] of Object.entries(configured)) {
    requireCondition(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      ),
      'INVALID_CONFIGURATION',
      setting
    );
    const entry =
      suffix === 'PROD'
        ? value
        : { endpoint: value, appPassword: env[`NAP_APP_PSWD_${suffix}`] };
    requireCondition(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      'INVALID_CONFIGURATION',
      setting
    );
    endpoint(entry.endpoint, setting);
    secret(entry.appPassword, setting);
    cells[id.toLowerCase()] = roleUrl(
      entry.endpoint,
      'nap-app',
      entry.appPassword
    );
  }
  return cells;
}

/**
 * Resolve the session cookie policy and reject an unsafe one.
 *
 * `SameSite=None` is refused in every environment, not only production:
 * this deployment serves the web client and the API from one origin, so a
 * cross-site cookie has no legitimate use here and would defeat the
 * origin check that replaces a CSRF token. Production additionally requires
 * `Secure`, since a cookie sent in the clear is a session handed to anyone on
 * the path. Together these are M0001-04-R009.
 * @param {Record<string, string | undefined>} env
 * @param {string} suffix Environment suffix, `DEV`, `TEST`, or `PROD`.
 * @returns {{secure: boolean, sameSite: 'lax'|'strict'}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
function cookieConfiguration(env, suffix) {
  const secureSetting = `COOKIE_SECURE_${suffix}`;
  const sameSiteSetting = `COOKIE_SAMESITE_${suffix}`;
  const secureText = env[secureSetting]?.trim() || 'true';
  requireCondition(
    secureText === 'true' || secureText === 'false',
    'INVALID_CONFIGURATION',
    secureSetting
  );
  const secure = secureText === 'true';
  requireCondition(
    suffix !== 'PROD' || secure,
    'INVALID_CONFIGURATION',
    secureSetting
  );
  const sameSite = (env[sameSiteSetting]?.trim() || 'lax').toLowerCase();
  requireCondition(
    sameSite === 'lax' || sameSite === 'strict',
    'INVALID_CONFIGURATION',
    sameSiteSetting
  );
  return { secure, sameSite };
}

/**
 * Resolve the session secret and lifetimes.
 *
 * The secret keys the HMAC that turns a browser token into the stored hash,
 * so a short or placeholder value would make stored hashes forgeable; 32
 * characters is the floor the domain enforces as well.
 * @param {Record<string, string | undefined>} env
 * @param {string} suffix Environment suffix, `DEV`, `TEST`, or `PROD`.
 * @returns {{secret: string, idleMinutes: number, absoluteHours: number}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
function sessionConfiguration(env, suffix) {
  const secretSetting = `SESSION_SECRET_${suffix}`;
  const value = secret(env[secretSetting], secretSetting);
  requireCondition(value.length >= 32, 'INVALID_CONFIGURATION', secretSetting);
  const idleMinutes = Number(env.SESSION_IDLE_MINUTES?.trim() || '30');
  const absoluteHours = Number(env.SESSION_ABSOLUTE_HOURS?.trim() || '12');
  requireCondition(
    Number.isInteger(idleMinutes) && idleMinutes >= 1 && idleMinutes <= 1440,
    'INVALID_CONFIGURATION',
    'SESSION_IDLE_MINUTES'
  );
  requireCondition(
    Number.isInteger(absoluteHours) &&
      absoluteHours >= 1 &&
      absoluteHours <= 168,
    'INVALID_CONFIGURATION',
    'SESSION_ABSOLUTE_HOURS'
  );
  requireCondition(
    idleMinutes <= absoluteHours * 60,
    'INVALID_CONFIGURATION',
    'SESSION_IDLE_MINUTES'
  );
  return { secret: value, idleMinutes, absoluteHours };
}

/**
 * Resolve the throttle secret and the Argon2id parameters.
 *
 * The throttle secret is per-environment and separate from the session
 * secret, so the key that turns an email address into a stored throttle row
 * is not the key that turns a cookie into a session. Reusing one value for
 * both would mean a leak of either compromises both, so a throttle secret
 * identical to the session secret is refused rather than merely discouraged.
 *
 * The Argon2id parameters are shared across environments and are floors, not
 * preferences: M0001-03 §7 fixes 19456 KiB, two iterations, and one lane as
 * the minimum, so a deployment may raise the cost of a login but never lower
 * it. Raising one is also what makes the post-login rehash fire.
 * @param {Record<string, string | undefined>} env
 * @param {string} suffix Environment suffix, `DEV`, `TEST`, or `PROD`.
 * @param {string} sessionSecret The session secret already resolved for this environment.
 * @returns {{throttleSecret: string, memoryKib: number, timeCost: number, parallelism: number}}
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
function authenticationConfiguration(env, suffix, sessionSecret) {
  const secretSetting = `AUTH_THROTTLE_SECRET_${suffix}`;
  const throttleSecret = secret(env[secretSetting], secretSetting);
  requireCondition(
    throttleSecret.length >= 32,
    'INVALID_CONFIGURATION',
    secretSetting
  );
  requireCondition(
    throttleSecret !== sessionSecret,
    'INVALID_CONFIGURATION',
    secretSetting
  );
  return { throttleSecret, ...argon2PolicyFromEnv(env) };
}

/**
 * Resolve the public application origin used by browser request protection.
 *
 * It must be configured, never derived from `Host` or a forwarded header,
 * which is what stops a proxy or an attacker-controlled header from widening
 * the set of origins allowed to change state.
 * @param {Record<string, string | undefined>} env
 * @param {string} suffix Environment suffix, `DEV`, `TEST`, or `PROD`.
 * @returns {string} Scheme, hostname, and port, with no path.
 * @throws {MaintenanceError} `INVALID_CONFIGURATION` naming the offending setting.
 */
function originConfiguration(env, suffix) {
  const setting = `APP_ORIGIN_${suffix}`;
  const value = env[setting]?.trim();
  requireCondition(value, 'INVALID_CONFIGURATION', setting);
  let origin;
  try {
    const url = new URL(value);
    requireCondition(
      ['http:', 'https:'].includes(url.protocol) &&
        url.origin !== 'null' &&
        `${url.origin}${url.pathname}`.replace(/\/$/, '') === url.origin,
      'INVALID_CONFIGURATION',
      setting
    );
    origin = url.origin;
  } catch {
    throw new MaintenanceError('INVALID_CONFIGURATION', setting);
  }
  requireCondition(
    suffix !== 'PROD' || origin.startsWith('https://'),
    'INVALID_CONFIGURATION',
    setting
  );
  return origin;
}

/**
 * Resolve the settings the running API needs from `NODE_ENV` and its
 * `*_DEV`, `*_TEST`, or `*_PROD` variables. Production reads the JSON
 * `ADMIN_DATABASE_PROD` entry and serves the built web client; other
 * environments read the plain endpoint and `NAP_APP_PSWD_*` values.
 * @param {Record<string, string | undefined>} env
 * @returns {{port: number, trustProxyHops: number, admin: string, cells: Record<string,string>, cache: {enabled: boolean, url: string|undefined, namespace: string}, session: {secret: string, idleMinutes: number, absoluteHours: number}, authentication: {throttleSecret: string, memoryKib: number, timeCost: number, parallelism: number}, cookie: {secure: boolean, sameSite: 'lax'|'strict'}, applicationOrigin: string, webRoot: string | undefined}} `admin` and `cells` contain `nap-app` connection strings.
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
  const session = sessionConfiguration(env, suffix);
  return {
    port,
    trustProxyHops,
    admin: roleUrl(entry.endpoint, 'nap-app', entry.appPassword),
    cells: cellConfiguration(env, suffix),
    cache: cacheConfiguration(env, suffix),
    session: session,
    authentication: authenticationConfiguration(env, suffix, session.secret),
    cookie: cookieConfiguration(env, suffix),
    applicationOrigin: originConfiguration(env, suffix),
    webRoot:
      suffix === 'PROD'
        ? fileURLToPath(new URL('../../../../web/dist/', import.meta.url))
        : undefined,
  };
}
