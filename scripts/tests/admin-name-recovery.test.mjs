/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it, vi } from 'vitest';
import { provisionRender } from '../provision/render.mjs';

/** Does: Builds an initial admin recovery fixture without external resources. Called by: recovery tests. */
function fixture() {
  const entry = {
    database: 'nap_prod_admin',
    operationId: 'operation-id',
    renderId: 'dpg-fixture',
    stage: 'registered',
  };
  const env = {
    RENDER_API_KEY: 'fixture',
    RENDER_API_SERVICE_ID: 'srv-fixture',
    RENDER_WORKSPACE_ID: 'tea-fixture',
    RENDER_REGION: 'virginia',
    RENDER_POSTGRES_VERSION: '18',
    RENDER_POSTGRES_PLAN: 'basic',
    RENDER_DISK_GB: '1',
  };
  const resource = {
    id: entry.renderId,
    name: entry.database,
    databaseName: 'nap_prod_admin_suffix',
    databaseUser: 'nap_setup_operationid',
    owner: { id: env.RENDER_WORKSPACE_ID },
    region: env.RENDER_REGION,
    status: 'available',
  };
  const info = {
    externalConnectionString:
      'postgres://fixture:password@external/nap_prod_admin_suffix',
    internalConnectionString:
      'postgres://fixture:password@internal/nap_prod_admin_suffix',
  };
  const context = {
    env,
    state: { databases: { admin: entry } },
    save: vi.fn(),
  };
  const call = vi.fn(async path =>
    path.startsWith('/services/')
      ? {
          ownerId: env.RENDER_WORKSPACE_ID,
          serviceDetails: { region: env.RENDER_REGION },
        }
      : path.endsWith('connection-info')
        ? info
        : resource
  );
  return { entry, context, resource, info, call };
}

it('recovers the verified physical name and retains the original request on retries', async () => {
  const f = fixture();
  await provisionRender(f.context, f.entry, f.call);
  expect(f.entry.requestedDatabase).toBe('nap_prod_admin');
  expect(f.entry.database).toBe('nap_prod_admin_suffix');
  expect(f.entry.endpoint).toContain('/nap_prod_admin_suffix');
  await provisionRender(f.context, f.entry, f.call);
  expect(f.call.mock.calls.every(args => !args[1])).toBe(true);
});

it.each(['id', 'name', 'databaseUser', 'region', 'owner'])(
  'rejects mismatched %s without adopting a name',
  async field => {
    const f = fixture();
    f.resource[field] = 'wrong';
    await expect(provisionRender(f.context, f.entry, f.call)).rejects.toThrow(
      'identity mismatch'
    );
    expect(f.entry.database).toBe('nap_prod_admin');
    expect(f.context.save).not.toHaveBeenCalled();
  }
);

it('rejects inconsistent connection information before recording recovery', async () => {
  const f = fixture();
  f.info.internalConnectionString =
    'postgres://fixture:password@internal/other';
  await expect(provisionRender(f.context, f.entry, f.call)).rejects.toThrow(
    'connection mismatch'
  );
  expect(f.entry.requestedDatabase).toBeUndefined();
  expect(f.context.save).not.toHaveBeenCalled();
});

it('does not rename an established database or a cell', async () => {
  for (const changes of [
    { endpoint: 'existing/nap_prod_admin' },
    { id: 'cell-id' },
  ]) {
    const f = fixture();
    Object.assign(f.entry, changes);
    await expect(provisionRender(f.context, f.entry, f.call)).rejects.toThrow(
      'identity mismatch'
    );
  }
});
