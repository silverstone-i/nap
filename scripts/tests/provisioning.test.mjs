/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { argumentsFor, configuration, roleUrl } from '../provision/config.mjs';
import { run } from '../../apps/api/dist/services/provisioning/engine.mjs';
import { createCellProvisioning } from '../../apps/api/dist/services/cellProvisioning.js';
import { createCellRegistry } from '../../apps/api/dist/services/cellRegistry.js';
import { createAdminDatabase } from '../../apps/api/dist/db/admin/index.js';
import { adminRepositories } from '../../apps/api/dist/db/admin/repositories.js';
import { withAdminTransaction } from '../../apps/api/dist/db/withAdminTransaction.js';
import { createRuntime } from '../../apps/api/dist/runtime.js';
import { authConfiguration } from '../../apps/api/dist/util/authConfig.js';

import { using, databasePrivileges } from '../provision/postgres.mjs';
import { cleanDev } from '../clean-dev.mjs';
import { provisionRender, renderClient } from '../provision/render.mjs';

let admin, cells, service, runtime, actor, origin, rootCookie;
const profiles = [];
let directory,
  context,
  started = false;
/** Does: Executes disposable cluster tooling with bounded output. Called by: fixture setup and teardown. */
function tool(program, args) {
  const result = spawnSync(program, args, {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    timeout: 30000,
  });
  if (result.status !== 0) throw new Error(`Fixture ${program} failed`);
}
/** Does: Exercises the real API and checks its response envelope. Called by: live-loading acceptance tests. */
async function http(
  path,
  body,
  cookie = rootCookie,
  method = body ? 'POST' : 'GET'
) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  expect(response.status, JSON.stringify(data)).toBe(200);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
/** Does: Provisions a tenant and logs in its initial employee against a newly loaded cell. Called by: the multi-cell acceptance test. */
async function tenantProfile(cell, suffix) {
  const control = '/api/admin-tenancy/v1/control/';
  await http(control + 'registry', {
    operation: 'tenant',
    code: 'tenant_' + suffix,
    name: 'Tenant ' + suffix,
    cell,
  });
  const tenant = await admin.db.tenants.findOneBy({
    tenant_code: 'tenant_' + suffix,
  });
  const email = suffix + '@fixture.test';
  const created = await http(control + 'members', {
    operation: 'member',
    target: tenant.id,
    kind: 'employee',
    email,
    name: 'Person ' + suffix,
    password: 'temporary-password-123',
  });
  const jobId = created.data.data.jobId;
  await http(control + 'provision', {
    operation: 'retry',
    job: jobId,
    name: 'Person ' + suffix,
  });
  await http(control + 'provision', {
    operation: 'activate',
    target: tenant.id,
  });
  const login = await http(
    '/api/admin-tenancy/v1/auth/login',
    { email, password: 'temporary-password-123' },
    null
  );
  await http(
    '/api/admin-tenancy/v1/auth/password',
    {
      currentPassword: 'temporary-password-123',
      newPassword: 'replacement-password-123',
    },
    login.cookie,
    'PUT'
  );
  const job = await admin.db.provisioning_jobs.findById(jobId);
  return {
    cookie: login.cookie,
    email,
    cell,
    tenant: tenant.id,
    record: job.record_id,
  };
}
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nap-provision-'));
  const password = 'fixture-owner-password';
  await writeFile(join(directory, 'password'), password, { mode: 0o600 });
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  tool('initdb', [
    '-D',
    join(directory, 'data'),
    '-U',
    'postgres',
    '--auth=scram-sha-256',
    `--pwfile=${join(directory, 'password')}`,
  ]);
  tool('pg_ctl', [
    '-D',
    join(directory, 'data'),
    '-l',
    join(directory, 'server.log'),
    '-o',
    `-h 127.0.0.1 -p ${port} -k ${directory}`,
    '-w',
    'start',
  ]);
  started = true;
  await using(
    `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
    db =>
      db.none(
        "CREATE ROLE nap_admin LOGIN NOSUPERUSER CREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS PASSWORD 'admin-fixture'"
      )
  );
  context = await configuration(
    argumentsFor(['setup', 'admin', '--env', 'test']),
    {
      NAP_ENV_FILE: join(directory, '.env'),
      NAP_PROVISION_STATE: join(directory, 'state.json'),
      SETUP_DATABASE_TEST: `127.0.0.1:${port}/postgres`,
      NAP_APP_PSWD_TEST: 'app-fixture',
      NAP_ADMIN_PSWD_TEST: 'admin-fixture',
      ROOT_TENANT_CODE_TEST: 'NAP',
      ROOT_COMPANY_TEST: 'NAP',
      ROOT_EMAIL_TEST: 'root@nap.test',
      ROOT_PASSWORD_TEST: 'fixture-root-password',
    }
  );
}, 30000);
afterAll(async () => {
  await runtime?.shutdown();
  await context?.close();
  if (started)
    tool('pg_ctl', [
      '-D',
      join(directory, 'data'),
      '-m',
      'immediate',
      '-w',
      'stop',
    ]);
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('prepares admin and starts one API before provisioning any cells', async () => {
  for (const operation of ['setup', 'migrate', 'bootstrap'])
    await run(argumentsFor([operation, 'admin', '--env', 'test']), context);
  admin = createAdminDatabase(
    roleUrl(
      context.state.databases.admin.endpoint,
      'nap_app',
      context.state.databases.admin.appPassword
    ),
    { repositories: adminRepositories }
  );
  actor = (await admin.one('SELECT id FROM admin.portal_users WHERE is_root'))
    .id;
  await context.close();
  context.close = async () => {};
  cells = createCellRegistry(new Map());
  service = createCellProvisioning(admin, cells, {
    environment: 'TEST',
    env: context.env,
  });
  cells.setProvisioning(service);
  const config = authConfiguration({
    ...context.env,
    SESSION_SECRET_TEST: 'session-secret-at-least-thirty-two-characters',
    AUTH_THROTTLE_SECRET_TEST: 'throttle-secret-at-least-thirty-two-characters',
    COOKIE_SECURE_TEST: 'false',
    COOKIE_SAMESITE_TEST: 'lax',
    TRUST_PROXY_HOPS_TEST: '0',
  });
  runtime = createRuntime({ admin, cells }, { auth: config });
  await runtime.start(0);
  origin = `http://127.0.0.1:${runtime.server.address().port}`;
  rootCookie = (
    await http(
      '/api/admin-tenancy/v1/auth/login',
      { email: 'root@nap.test', password: 'fixture-root-password' },
      null
    )
  ).cookie;
});
it('provisions two TEST cells into the same running API and preserves existing pools', async () => {
  const address = runtime.server.address();
  for (const suffix of ['east', 'west', '1']) {
    const id = await withAdminTransaction(admin, tx =>
      service.command(tx, actor, { operation: 'cell', suffix }, false)
    );
    expect(
      await withAdminTransaction(admin, tx =>
        service.command(tx, actor, { operation: 'cell', suffix }, false)
      )
    ).toBe(id);
    await service.drain();
    const row = await admin.one(
      'SELECT c.*,p.status,p.failure_code FROM admin.cells c JOIN admin.cell_provisioning p ON p.cell_id=c.id WHERE c.id=$1',
      [id]
    );
    expect(row.failure_code).toBeNull();
    expect(row).toMatchObject({
      enabled: true,
      database_name: `nap_test_cell_${suffix}`,
      status: 'completed',
    });
    expect(
      await cells.get(id).one('SELECT current_database() AS name')
    ).toEqual({ name: `nap_test_cell_${suffix}` });
    expect(runtime.server.address()).toEqual(address);
    if (suffix === 'east')
      expect(
        (await admin.one('SELECT status FROM admin.operator_bootstrap')).status
      ).toBe('completed');
    profiles.push(await tenantProfile(id, suffix));
    for (const profile of profiles) {
      const reply = await http(
        '/api/core/v1/identity/profile',
        null,
        profile.cookie
      );
      expect(JSON.stringify(reply.data)).toContain(profile.email);
      for (const [other, handle] of cells.handles)
        if (other !== profile.cell)
          await (
            await import('../../apps/api/dist/db/withTenantTransaction.js')
          ).withTenantTransaction(handle, profile.tenant, async tx =>
            expect(await tx.employees.findById(profile.record)).toBeNull()
          );
    }
  }
  expect(cells.handles.size).toBe(3);
});
it('rejects management TEST requests before saving an operation', async () => {
  await expect(
    withAdminTransaction(admin, tx =>
      service.command(tx, actor, { operation: 'cell', suffix: 'forbidden' })
    )
  ).rejects.toThrow();
  expect(
    await admin.oneOrNone(
      "SELECT id FROM admin.cells WHERE database_name='nap_test_cell_forbidden'"
    )
  ).toBeNull();
});
it('retains operation identity through disable and reactivation', async () => {
  const row = await admin.one(
    "SELECT id FROM admin.cells WHERE database_name='nap_test_cell_east'"
  );
  await withAdminTransaction(admin, tx =>
    service.command(
      tx,
      actor,
      { operation: 'cell-disable', cell: row.id },
      false
    )
  );
  expect((await admin.db.cells.findById(row.id)).enabled).toBe(false);
  await withAdminTransaction(admin, tx =>
    service.command(
      tx,
      actor,
      { operation: 'cell-activate', cell: row.id },
      false
    )
  );
  await service.drain();
  expect(
    await admin.one(
      'SELECT status,failure_code FROM admin.cell_provisioning WHERE cell_id=$1',
      [row.id]
    )
  ).toEqual({ status: 'completed', failure_code: null });
  expect((await admin.db.cells.findById(row.id)).enabled).toBe(true);
});
it('reconciles a timed-out Render create by immutable provisioning username without creating twice', async () => {
  const entry = {
    database: 'nap_prod_cell_east',
    operationId: '00000000-0000-4000-8000-000000000001',
    renderRequested: true,
  };
  const settings = {
    RENDER_API_KEY: 'secret',
    RENDER_WORKSPACE_ID: 'tea-test',
    RENDER_REGION: 'virginia',
    RENDER_POSTGRES_VERSION: '18',
    RENDER_POSTGRES_PLAN: 'basic_256mb',
    RENDER_DISK_GB: '5',
    RENDER_API_SERVICE_ID: 'srv-test',
  };
  const resource = {
    id: 'dpg-test',
    name: entry.database,
    databaseName: entry.database,
    databaseUser: 'nap_setup_00000000000040008000000000000001',
    region: 'virginia',
    owner: { id: 'tea-test' },
    status: 'available',
  };
  const call = vi.fn(async path =>
    path.startsWith('/services/')
      ? { ownerId: 'tea-test', serviceDetails: { region: 'virginia' } }
      : path.includes('?')
        ? [{ postgres: resource }]
        : path.endsWith('connection-info')
          ? {
              externalConnectionString:
                'postgres://setup:p@external/nap_prod_cell_east',
              internalConnectionString:
                'postgres://setup:p@internal/nap_prod_cell_east',
            }
          : resource
  );
  await provisionRender({ env: settings, save: vi.fn() }, entry, call, vi.fn());
  expect(entry.renderId).toBe('dpg-test');
  expect(call.mock.calls.every(args => args[1] !== 'POST')).toBe(true);
  const request = vi.fn(async () => {
    throw new Error('sensitive credential');
  });
  await expect(renderClient(settings, request)('/postgres')).rejects.toThrow(
    'Render request failed'
  );
});

it('keeps healthy cells usable when one live pool fails readiness', async () => {
  const entries = [...cells.handles];
  const failure = vi
    .spyOn(entries[0][1].db, 'connect')
    .mockRejectedValue(new Error('fixture unavailable'));
  try {
    await cells.check();
    expect(() => cells.get(entries[0][0])).toThrow();
    expect(await cells.get(entries[1][0]).one('SELECT 1 AS ok')).toEqual({
      ok: 1,
    });
    await http('/api/core/v1/identity/profile', null, profiles[1].cookie);
    await http('/api/admin-tenancy/v1/control/overview');
  } finally {
    failure.mockRestore();
    await cells.check();
  }
});
it('retries a failed operation with the same UUID after correcting the fixture setup endpoint', async () => {
  const id = await withAdminTransaction(admin, tx =>
    service.command(tx, actor, { operation: 'cell', suffix: 'retry' }, false)
  );
  const original = context.env.SETUP_DATABASE_TEST;
  context.env.SETUP_DATABASE_TEST = '127.0.0.1:1/postgres';
  await service.drain();
  expect(
    (
      await admin.one(
        'SELECT status FROM admin.cell_provisioning WHERE cell_id=$1',
        [id]
      )
    ).status
  ).toBe('failed');
  expect((await admin.db.cells.findById(id)).enabled).toBe(false);
  context.env.SETUP_DATABASE_TEST = original;
  await withAdminTransaction(admin, tx =>
    service.command(tx, actor, { operation: 'cell-retry', cell: id }, false)
  );
  await service.drain();
  expect(
    await admin.one(
      'SELECT status,failure_code FROM admin.cell_provisioning WHERE cell_id=$1',
      [id]
    )
  ).toEqual({ status: 'completed', failure_code: null });
});
it('restores persisted TEST connections into a fresh registry and closes every live pool', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parseEnv } = await import('node:util');
  const { createCellDatabase } =
    await import('../../apps/api/dist/db/cell/index.js');
  const { cellRepositories } =
    await import('../../apps/api/dist/db/cell/repositories.js');
  const map = JSON.parse(
    parseEnv(await readFile(context.env.NAP_ENV_FILE, 'utf8'))
      .CELL_DATABASES_TEST
  );
  const restored = createCellRegistry(
    new Map(
      Object.entries(map).map(([id, endpoint]) => [
        id,
        createCellDatabase(
          roleUrl(endpoint, 'nap_app', context.env.NAP_APP_PSWD_TEST),
          { repositories: cellRepositories }
        ),
      ])
    )
  );
  try {
    await restored.start(admin);
    for (const [id] of cells.handles)
      expect(await restored.get(id).one('SELECT 1 AS ok')).toEqual({ ok: 1 });
  } finally {
    restored.stop();
    await Promise.all([...restored.handles.values()].map(h => h.close()));
  }
});
it('persists production state only through Render and refreshes saved maps without deployment', async () => {
  const { remoteConfiguration } = await import('../provision/config.mjs');
  const { refreshRenderConnections } = await import('../provision/render.mjs');
  const calls = [];
  const call = async (path, method, body) => {
    calls.push({ path, method, body });
    return { value: '' };
  };
  const env = {
    NODE_ENV: 'production',
    RENDER_API_KEY: 'fixture-secret',
    RENDER_API_SERVICE_ID: 'srv-fixture',
  };
  const state = await remoteConfiguration({ environment: 'prod' }, env, call);
  state.state.databases.example = {
    id: 'fixture-id',
    appPassword: 'fixture-app',
  };
  await state.save();
  await state.close();
  expect(calls.at(-1).method).toBe('PUT');
  expect(calls.at(-1).path).toContain('/env-vars/NAP_PROVISION_STATE_PROD');
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(
    async url =>
      new Response(
        JSON.stringify({
          value: String(url).endsWith('CELL_DATABASES_PROD')
            ? '{}'
            : '{"endpoint":"internal/admin"}',
        }),
        { status: 200 }
      )
  );
  try {
    await refreshRenderConnections(env);
    expect(env.CELL_DATABASES_PROD).toBe('{}');
    expect(
      request.mock.calls.every(([url]) => !String(url).includes('/deploys'))
    ).toBe(true);
  } finally {
    request.mockRestore();
  }
});

it.each(['setup', 'migrate', 'seed', 'activate'])(
  'resumes the same operation after a %s stage failure',
  async stage => {
    const engine =
      await import('../../apps/api/dist/services/provisioning/engine.mjs');
    const original = engine.run;
    const id = await withAdminTransaction(admin, tx =>
      service.command(
        tx,
        actor,
        { operation: 'cell', suffix: `failure_${stage}` },
        false
      )
    );
    const spy = vi
      .spyOn(engine, 'run')
      .mockImplementation(async (command, ctx) => {
        if (command.operation === stage)
          throw new Error('fixture injected stage failure');
        return original(command, ctx);
      });
    try {
      await service.drain();
    } finally {
      spy.mockRestore();
    }
    expect(
      (
        await admin.one(
          'SELECT status FROM admin.cell_provisioning WHERE cell_id=$1',
          [id]
        )
      ).status
    ).toBe('failed');
    await withAdminTransaction(admin, tx =>
      service.command(tx, actor, { operation: 'cell-retry', cell: id }, false)
    );
    await service.drain();
    expect(
      await admin.one(
        'SELECT status,failure_code FROM admin.cell_provisioning WHERE cell_id=$1',
        [id]
      )
    ).toEqual({ status: 'completed', failure_code: null });
    expect(cells.get(id)).toBeDefined();
  }
);
it('migrates verified database names without changing UUIDs and refuses missing mappings', async () => {
  const { migrateDatabase } = await import('../../apps/api/dist/db/migrate.js');
  const { adminModules } =
    await import('../../apps/api/dist/db/admin/modules.js');
  const setup = roleUrl(
    context.env.SETUP_DATABASE_TEST,
    'nap_admin',
    context.env.NAP_ADMIN_PSWD_TEST
  );
  await using(setup, db =>
    db.none('CREATE DATABASE nap_test_transition OWNER nap_admin')
  );
  const url = new URL(setup);
  url.pathname = '/nap_test_transition';
  const baseline = adminModules.map(module => ({
    ...module,
    migrations: module.migrations.filter(m => m.id !== '006-cell-workflow'),
  }));
  await migrateDatabase('admin', url.href, baseline);
  const row = await using(url.href, db =>
    db.one(
      "INSERT INTO admin.cells(code,name,enabled) VALUES('1','Edited label',false) RETURNING id"
    )
  );
  await expect(
    migrateDatabase('admin', url.href, adminModules)
  ).rejects.toThrow();
  expect(
    await using(url.href, db =>
      db.one('SELECT code,name FROM admin.cells WHERE id=$1', [row.id])
    )
  ).toEqual({ code: '1', name: 'Edited label' });
  await using(url.href, db =>
    db.none(
      "INSERT INTO admin.cell_provisioning(cell_id,environment,name,database_name,operation_id) VALUES($1,'test','1','nap_test_cell_1',gen_random_uuid())",
      [row.id]
    )
  );
  await migrateDatabase('admin', url.href, adminModules);
  expect(
    await using(url.href, db =>
      db.one('SELECT id,database_name,enabled FROM admin.cells WHERE id=$1', [
        row.id,
      ])
    )
  ).toEqual({ id: row.id, database_name: 'nap_test_cell_1', enabled: false });
});
it('reconciles interrupted saved work at startup without allocating another UUID', async () => {
  const id = await withAdminTransaction(admin, tx =>
    service.command(
      tx,
      actor,
      { operation: 'cell', suffix: 'interrupted' },
      false
    )
  );
  await service.stop();
  await admin.none(
    "UPDATE admin.cell_provisioning SET status='running' WHERE cell_id=$1",
    [id]
  );
  service = createCellProvisioning(admin, cells, {
    environment: 'TEST',
    env: context.env,
  });
  cells.setProvisioning(service);
  await service.start();
  await service.drain();
  expect(
    await admin.one(
      'SELECT status,failure_code FROM admin.cell_provisioning WHERE cell_id=$1',
      [id]
    )
  ).toEqual({ status: 'completed', failure_code: null });
});

it.each(['Uppercase', 'with-dash', 'with space', '', 'a'.repeat(50)])(
  'rejects invalid TEST suffix %j without registration',
  async suffix => {
    const before = await admin.one(
      'SELECT count(*)::int AS count FROM admin.cells'
    );
    await expect(
      withAdminTransaction(admin, tx =>
        service.command(tx, actor, { operation: 'cell', suffix }, false)
      )
    ).rejects.toThrow();
    expect(
      await admin.one('SELECT count(*)::int AS count FROM admin.cells')
    ).toEqual(before);
  }
);
it('imports unfinished CLI metadata, checks identity, and preserves its credentials', async () => {
  const { readFile } = await import('node:fs/promises');
  const args = argumentsFor([
    'setup',
    'cell',
    '--env',
    'test',
    '--cell-name',
    'legacy',
  ]);
  const legacy = await configuration(args, context.env);
  let entry;
  try {
    await run(args, legacy);
    entry = { ...legacy.state.databases.nap_test_cell_legacy };
  } finally {
    await legacy.close();
  }
  const saved = JSON.parse(
    await readFile(context.env.NAP_PROVISION_STATE, 'utf8')
  );
  const altered = structuredClone(saved);
  altered.databases.nap_test_cell_legacy.operationId =
    '00000000-0000-4000-8000-000000000001';
  await writeFile(context.env.NAP_PROVISION_STATE, JSON.stringify(altered));
  await withAdminTransaction(admin, tx =>
    service.command(
      tx,
      actor,
      { operation: 'cell-retry', cell: entry.id },
      false
    )
  );
  await service.drain();
  expect(
    (
      await admin.one(
        'SELECT failure_code FROM admin.cell_provisioning WHERE cell_id=$1',
        [entry.id]
      )
    ).failure_code
  ).toBe('Saved operation identity differs from registration');
  await writeFile(context.env.NAP_PROVISION_STATE, JSON.stringify(saved));
  await withAdminTransaction(admin, tx =>
    service.command(
      tx,
      actor,
      { operation: 'cell-retry', cell: entry.id },
      false
    )
  );
  await service.drain();
  expect((await admin.db.cells.findById(entry.id)).enabled).toBe(true);
  const completed = JSON.parse(
    await readFile(context.env.NAP_PROVISION_STATE, 'utf8')
  ).databases.nap_test_cell_legacy;
  expect(completed).toMatchObject({
    id: entry.id,
    operationId: entry.operationId,
    appPassword: entry.appPassword,
    adminPassword: entry.adminPassword,
  });
});
it('waits for Render readiness and stops before creation if credential persistence fails', async () => {
  const entry = {
    database: 'nap_prod_cell_delayed',
    operationId: '00000000-0000-4000-8000-000000000002',
  };
  const env = {
    RENDER_API_KEY: 'fixture',
    RENDER_WORKSPACE_ID: 'tea-fixture',
    RENDER_REGION: 'virginia',
    RENDER_POSTGRES_VERSION: '18',
    RENDER_POSTGRES_PLAN: 'basic_256mb',
    RENDER_DISK_GB: '5',
    RENDER_API_SERVICE_ID: 'srv-fixture',
  };
  const resource = {
    id: 'dpg-fixture',
    name: entry.database,
    databaseName: entry.database,
    databaseUser: 'nap_setup_00000000000040008000000000000002',
    region: 'virginia',
    owner: { id: 'tea-fixture' },
    status: 'creating',
  };
  let probes = 0;
  const call = vi.fn(async (path, method) => {
    if (path.startsWith('/services/'))
      return { ownerId: 'tea-fixture', serviceDetails: { region: 'virginia' } };
    if (path.includes('?')) return [];
    if (method === 'POST') return resource;
    if (path.endsWith('/connection-info'))
      return {
        externalConnectionString:
          'postgres://setup:fixture@external/' + entry.database,
        internalConnectionString:
          'postgres://setup:fixture@internal/' + entry.database,
      };
    return { ...resource, status: ++probes > 1 ? 'available' : 'creating' };
  });
  const wait = vi.fn();
  const save = vi.fn();
  const probe = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error('private connection'), { code: 'ECONNREFUSED' })
    )
    .mockRejectedValueOnce(new Error('Connection terminated unexpectedly'))
    .mockResolvedValue(undefined);
  const connection = await provisionRender(
    { env, api: true, save },
    entry,
    call,
    wait,
    probe
  );
  expect(new URL(connection).hostname).toBe('internal');
  expect(probe).toHaveBeenCalledTimes(3);
  expect(probe).toHaveBeenLastCalledWith(connection);
  expect(wait).toHaveBeenCalledTimes(3);
  expect(
    call.mock.calls.filter(([, method]) => method === 'POST')
  ).toHaveLength(1);
  call.mockClear();
  wait.mockClear();
  probe
    .mockReset()
    .mockRejectedValue(
      Object.assign(new Error('private connection'), { code: '57P03' })
    );
  await expect(
    provisionRender({ env, api: true, save }, entry, call, wait, probe)
  ).rejects.toThrow('not accepting connections yet; retry the same cell');
  expect(probe).toHaveBeenCalledTimes(10);
  expect(wait).toHaveBeenCalledTimes(9);
  expect(call.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
  wait.mockClear();
  probe
    .mockReset()
    .mockRejectedValue(
      Object.assign(new Error('private password'), { code: '28P01' })
    );
  await expect(
    provisionRender({ env, api: true, save }, entry, call, wait, probe)
  ).rejects.toThrow('verify provider credentials and database permissions');
  expect(probe).toHaveBeenCalledOnce();
  expect(wait).not.toHaveBeenCalled();
  probe.mockClear();
  await expect(
    provisionRender(
      { env, api: true, save, signal: AbortSignal.abort() },
      entry,
      call,
      wait,
      probe
    )
  ).rejects.toThrow('readiness interrupted');
  expect(probe).not.toHaveBeenCalled();
  expect(
    new URL(await provisionRender({ env, save }, entry, call, wait, probe))
      .hostname
  ).toBe('external');
  expect(probe).not.toHaveBeenCalled();
  const blocked = {
    database: 'nap_prod_cell_blocked',
    operationId: '00000000-0000-4000-8000-000000000003',
  };
  call.mockClear();
  await expect(
    provisionRender(
      {
        env,
        save: async () => {
          throw new Error('fixture persistence failed');
        },
      },
      blocked,
      call,
      wait
    )
  ).rejects.toThrow('fixture persistence failed');
  expect(call.mock.calls.some(([, method]) => method === 'POST')).toBe(false);
});
it('closes all dynamic pools and reloads persisted cells after restarting the API', async () => {
  const spies = [...cells.handles.values()].map(handle =>
    vi.spyOn(handle, 'close')
  );
  expect(await runtime.shutdown()).toBe(0);
  for (const spy of spies) {
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  }
  const { readFile } = await import('node:fs/promises');
  const { parseEnv } = await import('node:util');
  const { createCellDatabase } =
    await import('../../apps/api/dist/db/cell/index.js');
  const { cellRepositories } =
    await import('../../apps/api/dist/db/cell/repositories.js');
  const map = JSON.parse(
    parseEnv(await readFile(context.env.NAP_ENV_FILE, 'utf8'))
      .CELL_DATABASES_TEST
  );
  admin = createAdminDatabase(
    roleUrl(
      context.state.databases.admin.endpoint,
      'nap_app',
      context.env.NAP_APP_PSWD_TEST
    ),
    { repositories: adminRepositories }
  );
  cells = createCellRegistry(
    new Map(
      Object.entries(map).map(([id, endpoint]) => [
        id,
        createCellDatabase(
          roleUrl(endpoint, 'nap_app', context.env.NAP_APP_PSWD_TEST),
          { repositories: cellRepositories }
        ),
      ])
    )
  );
  service = createCellProvisioning(admin, cells, {
    environment: 'TEST',
    env: context.env,
  });
  cells.setProvisioning(service);
  const auth = authConfiguration({
    ...context.env,
    SESSION_SECRET_TEST: 'session-secret-at-least-thirty-two-characters',
    AUTH_THROTTLE_SECRET_TEST: 'throttle-secret-at-least-thirty-two-characters',
    COOKIE_SECURE_TEST: 'false',
    COOKIE_SAMESITE_TEST: 'lax',
    TRUST_PROXY_HOPS_TEST: '0',
  });
  runtime = createRuntime({ admin, cells }, { auth });
  await runtime.start(0);
  origin = `http://127.0.0.1:${runtime.server.address().port}`;
  expect(cells.handles.size).toBe(spies.length);
  for (const profile of profiles)
    expect(
      JSON.stringify(
        (await http('/api/core/v1/identity/profile', null, profile.cookie)).data
      )
    ).toContain(profile.email);
});

it('cleans only DEV databases and resets files without changing credentials', async () => {
  const envFile = join(directory, 'cleanup.env');
  const stateFile = join(directory, 'cleanup-state.json');
  const inherited = {
    NAP_ENV_FILE: envFile,
    NAP_PROVISION_STATE: stateFile,
    SETUP_DATABASE_DEV: context.env.SETUP_DATABASE_TEST,
    NAP_ADMIN_PSWD_DEV: context.env.NAP_ADMIN_PSWD_TEST,
  };
  const original =
    "# Development\nCELL_DATABASES_DEV = '{\"old\":\"endpoint\"}' # cells\nNAP_ADMIN_PSWD_DEV='preserved'\nCELL_DATABASES_PROD='{}'\n";
  await writeFile(envFile, original);
  await writeFile(
    stateFile,
    JSON.stringify({ environment: 'dev', databases: {} })
  );
  const url = roleUrl(
    inherited.SETUP_DATABASE_DEV,
    'nap_admin',
    inherited.NAP_ADMIN_PSWD_DEV
  );
  await using(url, async db => {
    await db.none('CREATE DATABASE nap_dev_admin OWNER nap_admin');
    await db.none('CREATE DATABASE nap_dev_cell_cleanup OWNER nap_admin');
    await db.none('CREATE DATABASE nap_prod_cell_cleanup OWNER nap_admin');
  });
  await expect(cleanDev([], inherited)).rejects.toThrow('Required');
  await expect(
    cleanDev(['--confirm', '--env', 'prod'], inherited)
  ).rejects.toThrow('Required');
  expect(await readFile(envFile, 'utf8')).toBe(original);
  const ownerUrl = new URL(url);
  ownerUrl.username = 'postgres';
  ownerUrl.password = 'fixture-owner-password';
  await using(ownerUrl.href, db =>
    db.none('ALTER DATABASE nap_dev_cell_cleanup OWNER TO postgres')
  );
  await expect(cleanDev(['--confirm'], inherited)).rejects.toThrow('ownership');
  await using(url, async db => {
    expect(
      await db.oneOrNone(
        "SELECT 1 FROM pg_database WHERE datname='nap_dev_admin'"
      )
    ).not.toBeNull();
  });
  expect(await readFile(envFile, 'utf8')).toBe(original);
  expect(JSON.parse(await readFile(stateFile, 'utf8')).environment).toBe('dev');
  await using(ownerUrl.href, db =>
    db.none('ALTER DATABASE nap_dev_cell_cleanup OWNER TO nap_admin')
  );
  const result = await cleanDev(['--confirm'], inherited);
  expect(result.removed).toEqual(['nap_dev_admin', 'nap_dev_cell_cleanup']);
  expect(await readFile(envFile, 'utf8')).toBe(
    original.replace('{"old":"endpoint"}', '{}')
  );
  await expect(readFile(stateFile)).rejects.toMatchObject({ code: 'ENOENT' });
  await using(url, async db => {
    expect(
      await db.oneOrNone(
        "SELECT 1 FROM pg_database WHERE datname='nap_prod_cell_cleanup'"
      )
    ).not.toBeNull();
    expect(
      await db.oneOrNone(
        "SELECT 1 FROM pg_database WHERE datname='nap_test_admin'"
      )
    ).not.toBeNull();
    await db.none('DROP DATABASE nap_prod_cell_cleanup');
  });
  expect((await cleanDev(['--confirm'], inherited)).removed).toEqual([]);
});

it('transfers a provider-owned database to nap_admin and preserves runtime restrictions', async () => {
  const providerUrl = roleUrl(
    context.env.SETUP_DATABASE_TEST,
    'postgres',
    'fixture-owner-password'
  );
  const database = 'nap_test_render_ownership';
  await using(providerUrl, db =>
    db.none('CREATE DATABASE $1:name', [database])
  );
  const entry = { database, renderId: 'fixture-provider-resource' };
  await databasePrivileges(providerUrl, entry);
  await databasePrivileges(providerUrl, entry);
  await using(providerUrl, async db => {
    expect(
      await db.one(
        'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
        [database]
      )
    ).toEqual({ owner: 'nap_admin' });
    expect(
      await db.one(
        "SELECT has_database_privilege('nap_app', $1, 'CONNECT') AS connect, has_database_privilege('nap_app', $1, 'CREATE') AS create",
        [database]
      )
    ).toEqual({ connect: true, create: false });
    expect(
      await db.one(
        "SELECT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid=(SELECT oid FROM pg_roles WHERE rolname='nap_admin') AND member=(SELECT oid FROM pg_roles WHERE rolname='postgres')) AS member"
      )
    ).toEqual({ member: false });
  });
});
