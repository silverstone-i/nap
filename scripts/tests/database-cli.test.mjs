/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { maintainProduction } from '../provision/render-maintenance.mjs';
import { cli } from '../database.mjs';
import { configuration, ProvisioningError } from '../provision/config.mjs';
import { productionEnvironment } from '../provision/production-env.mjs';
import { run } from '../../apps/api/dist/services/provisioning/engine.mjs';

vi.mock('../provision/config.mjs', async importOriginal => ({
  ...(await importOriginal()),
  configuration: vi.fn(),
}));
vi.mock('../provision/production-env.mjs', () => ({
  productionEnvironment: vi.fn(),
}));
vi.mock('../../apps/api/dist/services/provisioning/engine.mjs', () => ({
  run: vi.fn(),
}));
vi.mock('../provision/render-maintenance.mjs', () => ({
  maintainProduction: vi.fn(),
}));
let context;
let errors;
let exitCode;
beforeEach(() => {
  vi.resetAllMocks();
  maintainProduction.mockImplementation((_command, _context, operation) =>
    operation()
  );
  exitCode = process.exitCode;
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  context = {
    stateFile: '/fixture/state.json',
    state: { databases: {} },
    save: vi.fn(),
    close: vi.fn(),
  };
  configuration.mockResolvedValue(context);
  productionEnvironment.mockResolvedValue({ RENDER_REGION: 'fixture' });
});
afterEach(() => {
  process.exitCode = exitCode;
  vi.restoreAllMocks();
});
it('fails preflight before opening state or starting provisioning', async () => {
  productionEnvironment.mockRejectedValue(
    new ProvisioningError('Required RENDER_API_SERVICE_ID')
  );
  await cli(['setup', 'admin', '--env', 'prod']);
  expect(configuration).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  expect(context.save).not.toHaveBeenCalled();
  expect(errors.mock.calls[0][0]).toContain(
    'Setup stopped before provisioning'
  );
});
it.each([
  ['setup', 'dev'],
  ['setup', 'test'],
  ['migrate', 'test'],
  ['bootstrap', 'dev'],
])('preserves configuration for %s %s', async (operation, environment) => {
  await cli([operation, 'admin', '--env', environment]);
  expect(productionEnvironment).not.toHaveBeenCalled();
  expect(configuration).toHaveBeenCalledWith(expect.anything(), process.env);
});
it('passes resolved defaults to setup and retains saved progress after failure', async () => {
  const entry = { operationId: 'original', stage: 'registered' };
  context.state.databases.admin = entry;
  run.mockImplementation(async (_command, current) => {
    current.activeEntry = entry;
    await current.save();
    throw new Error('private-fixture-password');
  });
  await cli(['setup', 'admin', '--env', 'prod']);
  expect(configuration).toHaveBeenCalledWith(expect.anything(), {
    RENDER_REGION: 'fixture',
  });
  expect(context.state.databases.admin).toMatchObject({
    operationId: 'original',
    stage: 'registered',
  });
  expect(errors.mock.calls[0][0]).toContain(
    'Saved progress is retained for retry at /fixture/state.json'
  );
  expect(errors.mock.calls[0][0]).not.toContain('private-fixture-password');
  expect(context.close).toHaveBeenCalled();
});
it('does not claim progress was saved when persistence fails', async () => {
  context.save.mockRejectedValue(new Error('private-fixture'));
  run.mockImplementation(async (_command, current) => {
    current.activeEntry = {};
    await current.save();
  });
  await cli(['setup', 'admin', '--env', 'prod']);
  expect(errors.mock.calls[0][0]).toContain(
    'No new provisioning progress was saved'
  );
});

it.each(['migrate', 'bootstrap'])(
  'preflights and wraps production %s',
  async operation => {
    await cli([operation, 'admin', '--env', 'prod']);
    expect(productionEnvironment).toHaveBeenCalledOnce();
    expect(maintainProduction).toHaveBeenCalledOnce();
  }
);
