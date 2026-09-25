/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createServer } from 'node:http';
import { transportVersion } from '@nap/shared';
import { createApp } from '../../src/app.js';
import { createRuntime } from '../../src/application/runtime/createRuntime.js';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';
import { repositories } from '../../src/modules/admin-tenancy/repositories.js';
const cleanups = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
async function web() {
  const dir = await mkdtemp(join(tmpdir(), 'nap-web-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, 'assets'));
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>NAP</title>');
  await writeFile(join(dir, 'assets', 'app.js'), 'window.loaded=true;');
  return dir;
}
it('serves production assets and SPA navigation while preserving API/health errors', async () => {
  const app = createApp({ webRoot: await web(), trustProxyHops: 1 });
  expect(app.get('trust proxy')).toBe(1);
  for (const path of ['/', '/tenants/123']) {
    const r = await request(app).get(path).set('Accept', 'text/html');
    expect(r.status).toBe(200);
    expect(r.text).toContain('<title>NAP</title>');
  }
  expect((await request(app).get('/assets/app.js')).text).toBe(
    'window.loaded=true;'
  );
  for (const path of [
    '/api/unknown',
    '/health/unknown',
    '/assets/missing.js',
  ]) {
    const r = await request(app).get(path).set('Accept', 'text/html');
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NOT_FOUND');
  }
  expect((await request(app).post('/tenants')).status).toBe(404);
  expect(
    (await request(app).get('/tenants').set('Accept', 'application/json'))
      .status
  ).toBe(404);
});
it('fails startup when the production build is absent', () =>
  expect(() => createApp({ webRoot: '/definitely-missing-nap-build' })).toThrow(
    'Built web client is unavailable'
  ));
it('loads production runtime and provisioning credentials', () => {
  const env = {
    NODE_ENV: 'production',
    TRUST_PROXY_HOPS_PROD: '1',
    SESSION_SECRET_PROD: 'production-session-secret-of-ample-length',
    AUTH_THROTTLE_SECRET_PROD: 'production-throttle-secret-of-ample-length',
    APP_ORIGIN_PROD: 'https://app.example',
    ADMIN_DATABASE_PROD: JSON.stringify({
      endpoint: 'db.example/nap_prod_admin',
      appPassword: 'runtime-secret',
      adminPassword: 'provisioning-secret',
    }),
    RENDER_API_KEY: 'render-key',
    RENDER_WORKSPACE_ID: 'workspace',
    RENDER_API_SERVICE_ID: 'service',
    RENDER_REGION: 'oregon',
    RENDER_POSTGRES_VERSION: '18',
    RENDER_POSTGRES_PLAN: 'basic_256mb',
    RENDER_DISK_GB: '5',
  };
  const c = runtimeConfiguration(env);
  expect(c.admin).toContain('nap-app:');
  expect(c.cache).toEqual({ enabled: false, url: undefined, namespace: 'nap' });
  expect(c.webRoot).toMatch(/apps\/web\/dist\/$/);
  expect(c.trustProxyHops).toBe(1);
  expect(() =>
    runtimeConfiguration({ ...env, TRUST_PROXY_HOPS_PROD: 'true' })
  ).toThrow('INVALID_CONFIGURATION');
  expect(() => runtimeConfiguration({ ...env, PORT: '3000garbage' })).toThrow(
    'INVALID_CONFIGURATION'
  );
  expect(() =>
    runtimeConfiguration({ ...env, ADMIN_DATABASE_PROD: 'secret-bad-json' })
  ).toThrow('INVALID_CONFIGURATION');
});
it('validates optional Redis cache configuration', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };
  expect(
    runtimeConfiguration({
      ...base,
      REDIS_CACHE_ENABLED_TEST: 'true',
      REDIS_URL_TEST: 'rediss://cache.example:6380',
      REDIS_CACHE_NAMESPACE_TEST: 'nap_test',
    }).cache
  ).toEqual({
    enabled: true,
    url: 'rediss://cache.example:6380',
    namespace: 'nap_test',
  });
  for (const change of [
    { REDIS_CACHE_ENABLED_TEST: 'yes' },
    { REDIS_CACHE_ENABLED_TEST: 'true' },
    {
      REDIS_CACHE_ENABLED_TEST: 'true',
      REDIS_URL_TEST: 'https://cache.example',
      REDIS_CACHE_NAMESPACE_TEST: 'nap_test',
    },
    {
      REDIS_CACHE_ENABLED_TEST: 'true',
      REDIS_URL_TEST: 'redis://cache.example',
      REDIS_CACHE_NAMESPACE_TEST: 'not valid',
    },
  ])
    expect(() => runtimeConfiguration({ ...base, ...change })).toThrow(
      'INVALID_CONFIGURATION'
    );
});
function handle() {
  const tx = {
    one: vi.fn(async sql => (sql.includes('pg_roles') ? { safe: true } : {})),
    any: vi.fn(async () =>
      Object.keys(repositories).map(relname => ({ relname, accessible: true }))
    ),
  };
  return {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: { tx: fn => fn(tx) },
    tx,
  };
}
it('requires safe Admin readiness before listening and closes the pool on shutdown', async () => {
  const admin = handle();
  const cache = { close: vi.fn(async () => {}) };
  const runtime = createRuntime({ admin, cache }, { webRoot: await web() });
  cleanups.push(() => runtime.shutdown());
  await runtime.start(0, '127.0.0.1');
  expect((await request(runtime.server).get('/health/ready')).status).toBe(200);
  admin.tx.any.mockRejectedValue(new Error('private db detail'));
  const down = await request(runtime.server).get('/health/ready');
  expect(down.status).toBe(503);
  expect(down.body.version).toBe(transportVersion);
  expect(down.text).not.toContain('private');
  const first = runtime.shutdown();
  expect(runtime.shutdown()).toBe(first);
  expect(await first).toBe(0);
  expect(admin.close).toHaveBeenCalledOnce();
  expect(cache.close).toHaveBeenCalledOnce();
});
it('refuses unsafe database startup and closes its handle', async () => {
  const admin = handle();
  admin.tx.one.mockResolvedValue({ safe: false });
  const runtime = createRuntime({ admin });
  cleanups.push(() => runtime.shutdown());
  await expect(runtime.start(0, '127.0.0.1')).rejects.toThrow(
    'unavailable or unsafe'
  );
  expect(runtime.server.listening).toBe(false);
  expect(admin.close).toHaveBeenCalledOnce();
  expect(await runtime.shutdown(1)).toBe(1);
  expect(admin.close).toHaveBeenCalledOnce();
});
it('bounds a stalled pool shutdown', async () => {
  const admin = handle();
  admin.close.mockImplementation(() => new Promise(() => {}));
  const runtime = createRuntime({ admin }, { poolCloseMs: 10 });
  expect(await runtime.shutdown()).toBe(1);
});

it('closes the pool when connecting fails', async () => {
  const admin = handle();
  const failure = new Error('connection failed');
  admin.connect.mockRejectedValue(failure);
  const runtime = createRuntime({ admin });
  await expect(runtime.start(0, '127.0.0.1')).rejects.toBe(failure);
  expect(admin.close).toHaveBeenCalledOnce();
  expect(runtime.server.listening).toBe(false);
});
it('closes the pool when the listener cannot bind', async () => {
  const occupied = createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise(resolve => occupied.close(resolve)));
  const admin = handle();
  const runtime = createRuntime({ admin });
  cleanups.push(() => runtime.shutdown());
  await expect(
    runtime.start(occupied.address().port, '127.0.0.1')
  ).rejects.toThrow('API failed to listen');
  expect(admin.close).toHaveBeenCalledOnce();
  expect(runtime.server.listening).toBe(false);
});
it('reads the cell connection map and provisioning settings (I0003-R014, R037)', () => {
  const cell = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
  const test = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };
  expect(runtimeConfiguration(test).cells).toEqual({});
  expect(runtimeConfiguration(test).provisioning).toBeNull();
  expect(
    runtimeConfiguration({
      ...test,
      CELL_DATABASES_TEST: JSON.stringify({ [cell]: 'db.example/nap_cell_1' }),
    }).cells
  ).toEqual({
    [cell]: {
      endpoint: 'db.example/nap_cell_1',
      appPassword: 'runtime-secret',
    },
  });
  for (const value of [
    'not-json',
    '[]',
    JSON.stringify({ 'not-a-uuid': 'db.example/nap_cell_1' }),
    JSON.stringify({ [cell]: '' }),
  ]) {
    let error;
    try {
      runtimeConfiguration({ ...test, CELL_DATABASES_TEST: value });
    } catch (caught) {
      error = caught;
    }
    expect(error?.code).toBe('INVALID_CONFIGURATION');
    expect(error?.setting).toBe('CELL_DATABASES_TEST');
  }

  const dev = {
    ...Object.fromEntries(
      Object.entries(test)
        .filter(([key]) => key !== 'NODE_ENV')
        .map(([key, value]) => [key.replace(/_TEST$/, '_DEV'), value])
    ),
    NODE_ENV: 'development',
    SETUP_DATABASE_DEV: 'db.example/postgres',
  };
  expect(() => runtimeConfiguration(dev)).toThrow('INVALID_CONFIGURATION');
  const provisioning = runtimeConfiguration({
    ...dev,
    NAP_ADMIN_PSWD_DEV: 'admin-secret',
    NAP_PROVISION_STATE: '/private/state.json',
    NAP_ENV_FILE: '/private/.env',
  }).provisioning;
  expect(provisioning).toEqual({
    adminPassword: 'admin-secret',
    appPassword: 'runtime-secret',
    setup: 'db.example/postgres',
    stateFile: '/private/state.json',
    envFile: '/private/.env',
  });
});
