/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { argumentsFor, configuration } from '../provision/config.mjs';
import { run } from '../database.mjs';
import { using, maintenanceUrl, identity } from '../provision/postgres.mjs';
import {
  provisionRender,
  renderClient,
  deployCell,
} from '../provision/render.mjs';

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
  context = await configuration(
    argumentsFor(['setup', 'admin', '--env', 'test']),
    {
      NAP_ENV_FILE: join(directory, '.env'),
      NAP_PROVISION_STATE: join(directory, 'state.json'),
      INFRA_DATABASE_URL_TEST: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
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

it('requires explicit environment, names and UUID selectors before work', () => {
  expect(() => argumentsFor(['setup', 'admin'])).toThrow();
  for (const name of ['EAST', 'east-west', '../east', 'x'.repeat(64)])
    expect(() =>
      argumentsFor(['setup', 'cell', '--env', 'prod', '--cell-name', name])
    ).toThrow();
  for (const name of ['1', 'east', 'asia'])
    expect(
      argumentsFor(['setup', 'cell', '--env', 'prod', '--cell-name', name])
        .database
    ).toBe(`nap_prod_cell_${name}`);
  expect(() =>
    argumentsFor(['migrate', 'cell', '--env', 'prod', '--cell-name', 'east'])
  ).toThrow();
});
it('prepares and bootstraps admin without a cell, then preserves replayed credentials', async () => {
  await run(argumentsFor(['setup', 'admin', '--env', 'test']), context);
  await run(argumentsFor(['setup', 'admin', '--env', 'test']), context);
  await run(argumentsFor(['migrate', 'admin', '--env', 'test']), context);
  await run(argumentsFor(['bootstrap', 'admin', '--env', 'test']), context);
  const url = maintenanceUrl(context.state.databases.admin);
  const first = await using(url, db =>
    db.one('SELECT id,password_hash FROM admin.portal_users WHERE is_root')
  );
  await run(argumentsFor(['bootstrap', 'admin', '--env', 'test']), context);
  expect(
    await using(url, db =>
      db.one('SELECT id,password_hash FROM admin.portal_users WHERE is_root')
    )
  ).toEqual(first);
  expect(
    await using(url, db =>
      db.one('SELECT count(*)::int AS count FROM admin.schema_migrations')
    )
  ).toEqual({ count: 5 });
}, 30000);
it('registers descriptive cells, binds physical identity, migrates and seeds without overwriting reference edits', async () => {
  for (const name of ['east', 'asia']) {
    const command = argumentsFor([
      'setup',
      'cell',
      '--env',
      'test',
      '--cell-name',
      name,
    ]);
    const result = await run(command, context);
    expect(result.database).toBe(`nap_test_cell_${name}`);
    expect(await run(command, context)).toEqual(result);
    const entry = context.state.databases[result.database];
    expect(
      await using(maintenanceUrl(context.state.databases.admin), db =>
        db.one('SELECT enabled FROM admin.cells WHERE id=$1', [entry.id])
      )
    ).toEqual({ enabled: false });
    await expect(
      using(maintenanceUrl(entry), db =>
        identity(
          db,
          { ...entry, id: '00000000-0000-4000-8000-000000000001' },
          'test'
        )
      )
    ).rejects.toThrow('identity mismatch');
    await run(
      argumentsFor(['migrate', 'cell', '--env', 'test', '--cell-id', entry.id]),
      context
    );
    await run(
      argumentsFor(['seed', 'cell', '--env', 'test', '--cell-id', entry.id]),
      context
    );
    await using(maintenanceUrl(entry), db =>
      db.none(
        "UPDATE reference.countries SET name='Custom USA' WHERE code='US'"
      )
    );
    await run(
      argumentsFor(['seed', 'cell', '--env', 'test', '--cell-id', entry.id]),
      context
    );
    expect(
      await using(maintenanceUrl(entry), db =>
        db.one("SELECT name FROM reference.countries WHERE code='US'")
      )
    ).toEqual({ name: 'Custom USA' });
    await expect(
      run(
        argumentsFor([
          'activate',
          'cell',
          '--env',
          'test',
          '--cell-id',
          entry.id,
        ]),
        context
      )
    ).rejects.toThrow();
  }
}, 30000);
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

it('enables only after the running API confirms the exact identity and seed readiness', async () => {
  const entry = context.state.databases.nap_test_cell_east;
  context.env.API_ORIGIN_TEST = 'http://127.0.0.1:3000';
  context.env.OPERATOR_COOKIE_TEST = 'session=fixture';
  const command = argumentsFor([
    'activate',
    'cell',
    '--env',
    'test',
    '--cell-id',
    entry.id,
  ]);
  const request = vi.spyOn(globalThis, 'fetch');
  try {
    request.mockResolvedValue(
      new Response(
        JSON.stringify({ data: { cellId: entry.id, ready: true } }),
        { status: 200 }
      )
    );
    await expect(run(command, context)).rejects.toThrow('verification failed');
    expect(
      await using(maintenanceUrl(context.state.databases.admin), db =>
        db.one('SELECT enabled FROM admin.cells WHERE id=$1', [entry.id])
      )
    ).toEqual({ enabled: false });
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            cellId: entry.id,
            ready: true,
            database: entry.database,
            environment: 'test',
            operationId: entry.operationId,
          },
        }),
        { status: 200 }
      )
    );
    await run(command, context);
    expect(
      await using(maintenanceUrl(context.state.databases.admin), db =>
        db.one('SELECT enabled FROM admin.cells WHERE id=$1', [entry.id])
      )
    ).toEqual({ enabled: true });
  } finally {
    request.mockRestore();
  }
});

it('refuses historical admin ledgers and mismatched saved endpoints before migration', async () => {
  const entry = context.state.databases.admin;
  await using(maintenanceUrl(entry), db =>
    db.none(
      "UPDATE admin.schema_migrations SET migration_id='001-tenants' WHERE migration_id='001-identity-tenancy'"
    )
  );
  try {
    await expect(
      run(argumentsFor(['migrate', 'admin', '--env', 'test']), context)
    ).rejects.toThrow('Historical admin migration ledger');
  } finally {
    await using(maintenanceUrl(entry), db =>
      db.none(
        "UPDATE admin.schema_migrations SET migration_id='001-identity-tenancy' WHERE migration_id='001-tenants'"
      )
    );
  }
  expect(() =>
    maintenanceUrl({ ...entry, endpoint: 'localhost/wrong' })
  ).toThrow('mismatch');
});

it('publishes runtime-only Render configuration while preserving other cells', async () => {
  const entry = {
    id: 'new-cell',
    runtimeEndpoint: 'internal/nap_prod_cell_east',
    appPassword: 'new-app',
  };
  const env = {
    RENDER_API_SERVICE_ID: 'srv-test',
    RENDER_WORKSPACE_ID: 'tea-test',
    RENDER_REGION: 'virginia',
  };
  const call = vi.fn(async (path, method) => {
    if (path === '/services/srv-test')
      return { ownerId: 'tea-test', serviceDetails: { region: 'virginia' } };
    if (path.includes('env-vars?'))
      return [
        {
          envVar: {
            key: 'CELL_DATABASES_PROD',
            value: JSON.stringify({
              'existing-cell': {
                endpoint: 'other/db',
                appPassword: 'existing-app',
                adminPassword: 'must-not-publish',
              },
            }),
          },
        },
      ];
    if (method === 'PUT') return {};
    if (method === 'POST') return { id: 'dep-test' };
    return { status: 'live' };
  });
  await deployCell(
    {
      env,
      state: {
        databases: {
          admin: {
            runtimeEndpoint: 'admin/nap_prod_admin',
            appPassword: 'admin-app',
            adminPassword: 'never-runtime',
          },
        },
      },
      save: vi.fn(),
    },
    entry,
    call,
    vi.fn()
  );
  const payload = call.mock.calls.find(
    args => args[0].endsWith('/CELL_DATABASES_PROD') && args[1] === 'PUT'
  )[2].value;
  expect(JSON.parse(payload)).toEqual({
    'existing-cell': { endpoint: 'other/db', appPassword: 'existing-app' },
    'new-cell': {
      endpoint: 'internal/nap_prod_cell_east',
      appPassword: 'new-app',
    },
  });
  expect(JSON.stringify(call.mock.calls)).not.toContain('never-runtime');
});
