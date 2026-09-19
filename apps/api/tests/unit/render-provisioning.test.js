/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { it, expect, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRender } from '../../src/infrastructure/provisioning/render.js';
const env = {
  RENDER_API_KEY: 'private-key',
  RENDER_WORKSPACE_ID: 'workspace',
  RENDER_API_SERVICE_ID: 'service',
  RENDER_REGION: 'oregon',
  RENDER_POSTGRES_VERSION: '18',
  RENDER_POSTGRES_PLAN: 'basic_256mb',
  RENDER_DISK_GB: '1',
  ADMIN_DATABASE_NAME_PROD: 'nap_prod_admin',
};
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'nap-render-'));
  try {
    await run(join(dir, 'state.json'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function provider() {
  let resource;
  let published = '';
  const operations = [];
  const db = {
    none: async () => {},
    one: async sql => {
      if (sql.includes('pg_database'))
        return {
          owner: 'nap-admin',
          actual: 'nap_prod_admin',
          connect: true,
          create: false,
        };
      if (sql.includes('pg_namespace')) return { unsafe: false };
      return {};
    },
    any: async () => [
      {
        rolname: 'nap-admin',
        rolcanlogin: true,
        rolcreatedb: true,
        rolcreaterole: true,
      },
      { rolname: 'nap-app', rolcanlogin: true },
    ],
  };
  const call = vi.fn(async (path, method = 'GET', body) => {
    operations.push([path, method, body]);
    if (path === '/services/service')
      return { ownerId: 'workspace', serviceDetails: { region: 'oregon' } };
    if (path.startsWith('/postgres?'))
      return resource ? [{ postgres: resource }] : [];
    if (path === '/postgres' && method === 'POST') {
      resource = {
        ...body,
        id: 'db-1',
        owner: { id: 'workspace' },
        status: 'available',
      };
      return { id: 'db-1' };
    }
    if (path === '/postgres/db-1/connection-info')
      return {
        externalConnectionString: `postgresql://${resource.databaseUser}:provider@external/nap_prod_admin`,
        internalConnectionString: `postgresql://${resource.databaseUser}:provider@internal/nap_prod_admin`,
      };
    if (path === '/postgres/db-1') {
      if (method === 'PATCH') resource = { ...resource, ...body };
      return structuredClone(resource);
    }
    if (path.endsWith('/env-vars/ADMIN_DATABASE_PROD')) {
      if (method === 'PUT') published = body.value;
      return { value: published };
    }
    throw new Error('Unexpected provider path');
  });
  return {
    call,
    using: async (_, fn) => fn(db),
    providerSetup: vi.fn(async () => {}),
    address: async () => '203.0.113.9',
    wait: async () => {},
    operations,
    get resource() {
      return resource;
    },
  };
}
it('creates privately, publishes internal endpoint, cleans access, and reuses resources on retry', async () =>
  fixture(async file => {
    const p = provider();
    const migrate = vi.fn(async () => ({ status: 'applied' }));
    expect((await runRender('setup', env, file, migrate, p)).status).toBe(
      'created'
    );
    expect(p.resource.ipAllowList).toEqual([]);
    let state = JSON.parse(await readFile(file, 'utf8'));
    expect(state.maintenanceAccess).toBeUndefined();
    expect(state.setupComplete).toBe(true);
    expect((await runRender('setup', env, file, migrate, p)).status).toBe(
      'unchanged'
    );
    expect(
      p.operations.filter(
        ([path, method]) => path === '/postgres' && method === 'POST'
      )
    ).toHaveLength(1);
    expect((await runRender('migrate', env, file, migrate, p)).status).toBe(
      'applied'
    );
    expect(migrate).toHaveBeenCalledOnce();
    const publication = p.operations.find(
      ([path, method]) =>
        path.endsWith('/env-vars/ADMIN_DATABASE_PROD') && method === 'PUT'
    );
    expect(JSON.parse(publication[2].value).endpoint).toBe(
      'internal/nap_prod_admin'
    );
  }));
it('cleans temporary access after database failure and retries against the same identity', async () =>
  fixture(async file => {
    const p = provider();
    p.providerSetup.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(runRender('setup', env, file, () => {}, p)).rejects.toThrow(
      'PRODUCTION_OPERATION_FAILED'
    );
    expect(p.resource.ipAllowList).toEqual([]);
    await runRender('setup', env, file, () => {}, p);
    expect(
      p.operations.filter(
        ([path, method]) => path === '/postgres' && method === 'POST'
      )
    ).toHaveLength(1);
  }));
it('retains cleanup intent when removal fails and clears it before a retry', async () =>
  fixture(async file => {
    const p = provider();
    const call = p.call;
    let fail = true;
    p.call = async (path, method, body) => {
      if (fail && method === 'PATCH' && body.ipAllowList.length === 0)
        throw new Error('cleanup failed');
      return call(path, method, body);
    };
    await expect(runRender('setup', env, file, () => {}, p)).rejects.toThrow(
      'PRODUCTION_OPERATION_FAILED'
    );
    expect(
      JSON.parse(await readFile(file, 'utf8')).maintenanceAccess
    ).toBeDefined();
    fail = false;
    await runRender('setup', env, file, () => {}, p);
    expect(
      JSON.parse(await readFile(file, 'utf8')).maintenanceAccess
    ).toBeUndefined();
    expect(p.resource.ipAllowList).toEqual([]);
  }));
it('reconciles a lost creation response without creating another database', async () =>
  fixture(async file => {
    const p = provider();
    const call = p.call;
    let first = true;
    p.call = async (path, method, body) => {
      const result = await call(path, method, body);
      if (path === '/postgres' && method === 'POST' && first) {
        first = false;
        throw new Error('lost response');
      }
      return result;
    };
    await expect(runRender('setup', env, file, () => {}, p)).rejects.toThrow(
      'PRODUCTION_OPERATION_FAILED'
    );
    await runRender('setup', env, file, () => {}, p);
    expect(
      p.operations.filter(
        ([path, method]) => path === '/postgres' && method === 'POST'
      )
    ).toHaveLength(1);
  }));
it('refuses an uncertain absent creation outcome and mismatched saved settings', async () =>
  fixture(async file => {
    const p = provider();
    const call = p.call;
    p.call = async (path, method, body) => {
      if (path === '/postgres' && method === 'POST')
        throw new Error('uncertain');
      return call(path, method, body);
    };
    await expect(runRender('setup', env, file, () => {}, p)).rejects.toThrow(
      'PRODUCTION_OPERATION_FAILED'
    );
    await expect(runRender('setup', env, file, () => {}, p)).rejects.toThrow(
      'CREATION_OUTCOME_UNCERTAIN'
    );
    await expect(
      runRender(
        'setup',
        { ...env, RENDER_WORKSPACE_ID: 'other' },
        file,
        () => {},
        p
      )
    ).rejects.toThrow('STATE_IDENTITY_MISMATCH');
  }));
it('does not remove an existing operator access rule', async () =>
  fixture(async file => {
    const p = provider();
    const call = p.call;
    p.call = async (path, method, body) => {
      const result = await call(path, method, body);
      if (path === '/postgres' && method === 'POST')
        p.resource.ipAllowList.push({
          cidrBlock: '203.0.113.9/32',
          description: 'existing',
        });
      return result;
    };
    await runRender('setup', env, file, () => {}, p);
    expect(p.resource.ipAllowList).toEqual([
      { cidrBlock: '203.0.113.9/32', description: 'existing' },
    ]);
  }));
it('rejects configured credentials that disagree with saved state before provider calls', async () =>
  fixture(async file => {
    const p = provider();
    await runRender('setup', env, file, () => {}, p);
    p.call.mockClear();
    const state = JSON.parse(await readFile(file, 'utf8'));
    const configured = JSON.stringify({
      endpoint: state.runtimeEndpoint,
      adminPassword: 'changed',
      appPassword: state.appPassword,
    });
    await expect(
      runRender(
        'setup',
        { ...env, ADMIN_DATABASE_PROD: configured },
        file,
        () => {},
        p
      )
    ).rejects.toThrow('CONFIGURATION_STATE_MISMATCH');
    expect(p.call).not.toHaveBeenCalled();
  }));
it('rejects invalid production endpoint configuration before contacting the provider', async () =>
  fixture(async file => {
    const p = provider();
    await expect(
      runRender(
        'setup',
        { ...env, ADMIN_DATABASE_PROD: '{invalid' },
        file,
        () => {},
        p
      )
    ).rejects.toThrow('INVALID_CONFIGURATION');
    expect(p.call).not.toHaveBeenCalled();
  }));
