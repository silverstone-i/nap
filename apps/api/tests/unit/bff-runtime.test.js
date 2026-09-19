/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
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
it('loads production runtime credentials without requiring a maintenance password', () => {
  const env = {
    NODE_ENV: 'production',
    TRUST_PROXY_HOPS_PROD: '1',
    ADMIN_DATABASE_PROD: JSON.stringify({
      endpoint: 'db.example/nap_prod_admin',
      appPassword: 'runtime-secret',
    }),
  };
  const c = runtimeConfiguration(env);
  expect(c.admin).toContain('nap-app:');
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
  const runtime = createRuntime({ admin }, { webRoot: await web() });
  cleanups.push(() => runtime.shutdown());
  await runtime.start(0, '127.0.0.1');
  expect((await request(runtime.server).get('/health/ready')).status).toBe(200);
  admin.tx.any.mockRejectedValue(new Error('private db detail'));
  const down = await request(runtime.server).get('/health/ready');
  expect(down.status).toBe(503);
  expect(down.text).not.toContain('private');
  const first = runtime.shutdown();
  expect(runtime.shutdown()).toBe(first);
  expect(await first).toBe(0);
  expect(admin.close).toHaveBeenCalledOnce();
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
  await runtime.shutdown(1);
  expect(admin.close).toHaveBeenCalledOnce();
});
it('bounds a stalled pool shutdown', async () => {
  const admin = handle();
  admin.close.mockImplementation(() => new Promise(() => {}));
  const runtime = createRuntime({ admin }, { poolCloseMs: 10 });
  expect(await runtime.shutdown()).toBe(1);
});
