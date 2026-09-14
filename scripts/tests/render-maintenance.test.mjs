/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, expect, it, vi } from 'vitest';
import {
  maintainProduction,
  publishAdmin,
} from '../provision/render-maintenance.mjs';
let context;
let entry;
let resource;
let variables;
let call;
let address;
beforeEach(() => {
  entry = {
    database: 'nap_prod_admin',
    operationId: 'fixture-id',
    renderId: 'dpg-fixture',
    endpoint: 'external/nap_prod_admin?sslmode=require',
    runtimeEndpoint: 'internal/nap_prod_admin',
    adminPassword: 'admin-fixture',
    appPassword: 'app-fixture',
    stage: 'registered',
  };
  context = {
    env: {
      RENDER_API_SERVICE_ID: 'srv-fixture',
      RENDER_API_KEY: 'key-fixture',
      RENDER_WORKSPACE_ID: 'tea-fixture',
      RENDER_REGION: 'virginia',
    },
    state: { environment: 'prod', databases: { admin: entry } },
    save: vi.fn(),
  };
  resource = {
    databaseName: entry.database,
    databaseUser: 'nap_setup_fixtureid',
    owner: { id: 'tea-fixture' },
    region: 'virginia',
    ipAllowList: [
      { cidrBlock: '192.0.2.2/32', description: 'existing operator' },
    ],
  };
  variables = {};
  address = vi.fn(async () => '192.0.2.1');
  call = vi.fn(async (path, method = 'GET', body) => {
    if (path.includes('/env-vars/')) {
      const key = path.split('/').at(-1);
      if (method === 'PUT') variables[key] = body.value;
      return { value: variables[key] || '' };
    }
    if (path.startsWith('/services/'))
      return { ownerId: 'tea-fixture', serviceDetails: { region: 'virginia' } };
    if (method === 'PATCH')
      resource.ipAllowList = structuredClone(body.ipAllowList);
    return structuredClone(resource);
  });
});

it('saves intent before opening access and removes only its rule after setup', async () => {
  context.save.mockImplementation(async () => {
    if (entry.maintenanceAccess) expect(resource.ipAllowList).toHaveLength(1);
  });
  const result = await maintainProduction(
    { operation: 'setup' },
    context,
    async () => {
      await context.prepareMaintenance(entry);
      expect(resource.ipAllowList).toHaveLength(2);
      return 'created';
    },
    call,
    address,
    async () => {}
  );
  expect(result).toBe('created');
  expect(resource.ipAllowList).toEqual([
    { cidrBlock: '192.0.2.2/32', description: 'existing operator' },
  ]);
  expect(entry.maintenanceAccess).toBeUndefined();
});

it('preserves an existing rule for the same operator address', async () => {
  resource.ipAllowList.push({
    cidrBlock: '192.0.2.1/32',
    description: 'permanent',
  });
  await maintainProduction(
    { operation: 'setup' },
    context,
    async () => context.prepareMaintenance(entry),
    call,
    address,
    async () => {}
  );
  expect(call.mock.calls.some(([, method]) => method === 'PATCH')).toBe(false);
  expect(resource.ipAllowList).toHaveLength(2);
});

it('cleans up on SQL failure and does not expose the raw error', async () => {
  await expect(
    maintainProduction(
      { operation: 'migrate' },
      context,
      async () => {
        throw Object.assign(new Error('secret-fixture'), { code: '42501' });
      },
      call,
      address,
      async () => {}
    )
  ).rejects.toThrow('Production migrate: database privileges are insufficient');
  expect(resource.ipAllowList).toHaveLength(1);
  expect(variables).toEqual({});
});

it('recovers stale cleanup intent before opening a new rule', async () => {
  entry.maintenanceAccess = {
    cidrBlock: '192.0.2.9/32',
    description: 'NAP maintenance fixture-id',
  };
  resource.ipAllowList.push(entry.maintenanceAccess);
  await maintainProduction(
    { operation: 'setup' },
    context,
    async () => {
      await context.prepareMaintenance(entry);
      expect(
        resource.ipAllowList.some(x => x.cidrBlock === '192.0.2.9/32')
      ).toBe(false);
    },
    call,
    address,
    async () => {}
  );
  expect(resource.ipAllowList).toHaveLength(1);
});

it('retains durable cleanup intent when provider cleanup fails', async () => {
  const original = call.getMockImplementation();
  call.mockImplementation(async (path, method, body) => {
    if (method === 'PATCH' && body.ipAllowList.length === 1)
      throw new Error('provider secret');
    return original(path, method, body);
  });
  await expect(
    maintainProduction(
      { operation: 'setup' },
      context,
      async () => context.prepareMaintenance(entry),
      call,
      address,
      async () => {}
    )
  ).rejects.toThrow('cleanup failed');
  expect(entry.maintenanceAccess).toBeDefined();
});

it('refuses resource mismatch before granting access or running SQL', async () => {
  resource.databaseUser = 'another-operation';
  const operation = vi.fn();
  await expect(
    maintainProduction(
      { operation: 'migrate' },
      context,
      operation,
      call,
      address,
      async () => {}
    )
  ).rejects.toThrow('identity mismatch');
  expect(operation).not.toHaveBeenCalled();
  expect(call.mock.calls.some(([, method]) => method === 'PATCH')).toBe(false);
});

it('uses verify-full and publishes internal admin state while preserving cells', async () => {
  variables.NAP_PROVISION_STATE_PROD = JSON.stringify({
    environment: 'prod',
    databases: { cell: { id: 'preserved' } },
  });
  variables.CELL_DATABASES_PROD = '{"existing":"preserved"}';
  await maintainProduction(
    { operation: 'migrate' },
    context,
    async () => {
      expect(entry.endpoint).toContain('sslmode=verify-full');
      entry.stage = 'migrated';
    },
    call,
    address,
    async () => {}
  );
  expect(
    JSON.parse(variables.NAP_PROVISION_STATE_PROD).databases
  ).toMatchObject({
    cell: { id: 'preserved' },
    admin: { endpoint: entry.runtimeEndpoint, stage: 'migrated' },
  });
  expect(
    JSON.parse(variables.NAP_PROVISION_STATE_PROD).databases.admin
      .maintenanceAccess
  ).toBeUndefined();
  expect(JSON.parse(variables.ADMIN_DATABASE_PROD).endpoint).toBe(
    entry.runtimeEndpoint
  );
  expect(variables.CELL_DATABASES_PROD).toBe('{"existing":"preserved"}');
  const before = structuredClone(variables);
  await publishAdmin(context, call);
  expect(variables).toEqual(before);
});

it('refuses mismatched remote identity without overwriting it', async () => {
  variables.NAP_PROVISION_STATE_PROD = JSON.stringify({
    environment: 'prod',
    databases: { admin: { operationId: 'other' } },
  });
  await expect(publishAdmin(context, call)).rejects.toThrow(
    'identity or credentials differ'
  );
  expect(call.mock.calls.some(([, method]) => method === 'PUT')).toBe(false);
});
