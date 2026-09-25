/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { createStages } from '../../src/application/provisioning/stages.js';
import {
  createRenderCellDriver,
  providerUser,
} from '../../src/infrastructure/provisioning/renderCells.js';

const CELL = '6f1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const OP = '0a1b2c3d-4e5f-4a7b-8c9d-0e1f2a3b4c5d';
const job = {
  cell: { id: CELL, database_name: 'nap_prod_cell_east' },
  operationId: OP,
};
const target = {
  database: 'nap_prod_cell_east',
  endpoint: 'cell-host/nap_prod_cell_east',
  adminPassword: 'admin-secret',
  appPassword: 'app-secret',
};

function fakeCell(existing = null) {
  const inserted = [];
  const handle = {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    db: {
      physical_identity: {
        findOneBy: vi.fn(async () => existing),
        record: vi.fn(async row => inserted.push(row)),
      },
    },
  };
  return { connect: vi.fn(() => handle), handle, inserted };
}

function stagesWith(overrides = {}) {
  const driver = {
    setup: vi.fn(async () => target),
    connection: vi.fn(async () => target),
    publish: vi.fn(async () => ({ changed: true })),
  };
  const registry = { add: vi.fn(async () => ({ ready: true })) };
  const cell = fakeCell(overrides.identity);
  const migrate = vi.fn(async () => ({ status: 'applied' }));
  const stages = createStages({
    driver: { ...driver, ...overrides.driver },
    registry: { ...registry, ...overrides.registry },
    environment: 'prod',
    modules: overrides.modules ?? [],
    migrate,
    connect: cell.connect,
  });
  return { stages, driver, registry, cell, migrate };
}

async function codeOf(promise) {
  try {
    await promise;
  } catch (error) {
    return error.code;
  }
  return undefined;
}

describe('provisioning stages (I0003-R007–R010)', () => {
  it('migrates and writes the physical identity once (R008)', async () => {
    const { stages, cell, migrate } = stagesWith();
    await stages.migration(job);
    expect(migrate).toHaveBeenCalledWith(target, []);
    expect(cell.inserted).toEqual([
      {
        cell_id: CELL,
        database_name: 'nap_prod_cell_east',
        operation_id: OP,
        environment: 'prod',
      },
    ]);
    expect(cell.handle.close).toHaveBeenCalled();
  });

  it('accepts a matching identity row and refuses a different one', async () => {
    const row = {
      cell_id: CELL,
      database_name: 'nap_prod_cell_east',
      operation_id: OP,
      environment: 'prod',
    };
    await stagesWith({ identity: row }).stages.migration(job);
    expect(
      await codeOf(
        stagesWith({
          identity: { ...row, operation_id: CELL },
        }).stages.migration(job)
      )
    ).toBe('IDENTITY_MISMATCH');
  });

  it('runs registered seed steps and skips when there are none (R009)', async () => {
    const seed = vi.fn(async () => {});
    await stagesWith({ modules: [{ seed }] }).stages.seed(job);
    expect(seed).toHaveBeenCalledTimes(1);
    const { stages, driver } = stagesWith();
    await stages.seed(job);
    expect(driver.connection).not.toHaveBeenCalled();
  });

  it('publishes, then adds to the registry, on activation (R010)', async () => {
    const { stages, driver, registry } = stagesWith();
    await stages.activation(job);
    expect(driver.publish).toHaveBeenCalledWith(CELL, target);
    expect(registry.add).toHaveBeenCalledWith(CELL, {
      endpoint: target.endpoint,
      appPassword: target.appPassword,
    });
    expect(
      await codeOf(
        stagesWith({
          registry: {
            add: async () => ({ ready: false, reason: 'IDENTITY_MISSING' }),
          },
        }).stages.activation(job)
      )
    ).toBe('IDENTITY_MISSING');
  });

  it('reduces unexpected errors to the stage code without details (R039)', async () => {
    const leak = new Error('postgresql://nap-admin:admin-secret@cell-host');
    const { stages } = stagesWith({
      driver: {
        setup: async () => {
          throw leak;
        },
      },
    });
    const error = await stages.setup(job).catch(e => e);
    expect(error.code).toBe('SETUP_FAILED');
    expect(error.message).toBe('SETUP_FAILED');
  });
});

function fakeRender({ existing = [], status = 'available', createFails } = {}) {
  const vars = {};
  const operations = [];
  let instance = existing[0];
  const call = vi.fn(async (path, method = 'GET', body) => {
    operations.push([path, method]);
    if (path.includes('/env-vars')) {
      if (method === 'PUT') {
        vars[path.split('/').at(-1)] = body.value;
        return {};
      }
      return Object.entries(vars).map(([key, value]) => ({
        envVar: { key, value },
      }));
    }
    if (path.startsWith('/postgres?'))
      return instance ? [{ postgres: instance }] : [];
    if (path === '/postgres' && method === 'POST') {
      if (createFails)
        throw Object.assign(new Error(createFails), { code: createFails });
      instance = {
        id: 'dpg-1',
        name: body.name,
        databaseName: body.databaseName,
        databaseUser: body.databaseUser,
      };
      return { id: 'dpg-1' };
    }
    if (path.endsWith('/connection-info'))
      return {
        internalConnectionString: `postgresql://${instance.databaseUser}:provider@dpg-1-a/${instance.databaseName}`,
      };
    if (path.startsWith('/postgres/')) return { ...instance, status };
    throw new Error('unexpected ' + path);
  });
  return { call, vars, operations };
}

const render = {
  RENDER_API_KEY: 'key',
  RENDER_WORKSPACE_ID: 'workspace',
  RENDER_API_SERVICE_ID: 'service',
  RENDER_REGION: 'oregon',
  RENDER_POSTGRES_VERSION: '18',
  RENDER_POSTGRES_PLAN: 'basic_256mb',
  RENDER_DISK_GB: '1',
};

function driverWith(api) {
  const connect = vi.fn(async (url, fn) =>
    fn({
      none: async () => {},
      one: async sql => {
        if (sql.includes('pg_database'))
          return {
            owner: 'nap-admin',
            actual: 'nap_prod_cell_east',
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
    })
  );
  const providerSetup = vi.fn(async () => {});
  const driver = createRenderCellDriver(
    { adminPassword: 'admin', render },
    { call: api.call, wait: async () => {}, providerSetup, connect }
  );
  return { driver, providerSetup };
}

describe('Render cell driver (I0003-R007, R011, AC13)', () => {
  it('creates one instance per cell, then publishes CELL_DATABASES_PROD', async () => {
    const api = fakeRender();
    const { driver, providerSetup } = driverWith(api);
    const result = await driver.setup(job);
    expect(result.endpoint).toBe('dpg-1-a/nap_prod_cell_east');
    expect(
      api.operations.filter(([p, m]) => p === '/postgres' && m === 'POST')
    ).toHaveLength(1);
    expect(providerSetup).toHaveBeenCalledTimes(1);
    const state = JSON.parse(api.vars.NAP_PROVISION_STATE_PROD)[CELL];
    expect(state).toMatchObject({ renderId: 'dpg-1', operationId: OP });

    // A retry reuses the saved instance and passwords.
    const again = await driver.setup(job);
    expect(again).toEqual(result);
    expect(
      api.operations.filter(([p, m]) => p === '/postgres' && m === 'POST')
    ).toHaveLength(1);

    await driver.publish(CELL, result);
    expect(JSON.parse(api.vars.CELL_DATABASES_PROD)).toEqual({
      [CELL]: {
        endpoint: result.endpoint,
        appPassword: result.appPassword,
        adminPassword: result.adminPassword,
      },
    });
  });

  it('refuses an instance created by another operation (R036)', async () => {
    const api = fakeRender({
      existing: [
        {
          id: 'dpg-9',
          name: `nap-cell-${CELL}`,
          databaseName: 'nap_prod_cell_east',
          databaseUser: providerUser(CELL),
        },
      ],
    });
    const error = await driverWith(api)
      .driver.setup(job)
      .catch(e => e);
    expect(error.code).toBe('TARGET_NOT_OWNED');
  });

  it('fails with CREATE_OUTCOME_UNKNOWN and never creates twice (R035)', async () => {
    const api = fakeRender({ createFails: 'RENDER_REQUEST_FAILED' });
    const { driver } = driverWith(api);
    expect((await driver.setup(job).catch(e => e)).code).toBe(
      'CREATE_OUTCOME_UNKNOWN'
    );
    expect((await driver.setup(job).catch(e => e)).code).toBe(
      'CREATE_OUTCOME_UNKNOWN'
    );
    expect(
      api.operations.filter(([p, m]) => p === '/postgres' && m === 'POST')
    ).toHaveLength(1);
  });
});
