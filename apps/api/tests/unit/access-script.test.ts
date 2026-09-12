/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assignment: vi.fn(),
  transaction: vi.fn(),
  transition: vi.fn(),
  readFile: vi.fn(),
  cellConfiguration: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));
vi.mock('../../src/db/admin/index.js', () => ({
  createAdminDatabase: () => ({
    db: { cells: { assignment: mocks.assignment } },
    close: vi.fn(),
  }),
}));
vi.mock('../../src/db/cell/index.js', () => ({
  createCellDatabase: () => ({ close: vi.fn() }),
}));
vi.mock('../../src/db/withTenantTransaction.js', () => ({
  withTenantTransaction: mocks.transaction,
}));
vi.mock('../../src/services/accessTransition.js', async importOriginal => ({
  ...(await importOriginal<
    typeof import('../../src/services/accessTransition.js')
  >()),
  transitionAccess: mocks.transition,
}));
vi.mock('../../src/util/env.js', () => ({
  loadLocalEnvironment: vi.fn(),
  resolveMigrationConfiguration: vi.fn(),
  resolveCellMaintenanceConfiguration: mocks.cellConfiguration,
}));

const cellId = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
const otherCellId = 'abcdefab-abcd-4abc-8abc-abcdefabcdee';
const tenantId = '00000000-0000-4000-8000-000000000001';
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.exitCode = undefined;
  mocks.assignment.mockResolvedValue({ enabled: true, cell_id: cellId });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

it('seeds with an uppercase CLI cell UUID matching the assignment', async () => {
  process.argv = ['node', 'access', 'seed', tenantId, cellId.toUpperCase()];
  await import('../../src/scripts/access.js');
  expect(mocks.cellConfiguration).toHaveBeenCalledWith(cellId);
  expect(mocks.transaction).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
});
it('refuses seed execution for a different assigned cell', async () => {
  process.argv = ['node', 'access', 'seed', tenantId, otherCellId];
  await import('../../src/scripts/access.js');
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});
it.each([
  [cellId.toUpperCase(), cellId],
  [cellId, cellId.toUpperCase()],
  [cellId.toUpperCase(), cellId.toUpperCase()],
])('transitions with CLI %s and mapped cell %s', async (cli, mapped) => {
  process.argv = ['node', 'access', 'transition', 'mapping.json', cli];
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      operator: tenantId,
      cell: mapped,
      platform: [],
      tenants: [],
    })
  );
  await import('../../src/scripts/access.js');
  expect(mocks.transition).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({ cell: cellId })
  );
  expect(process.exitCode).toBeUndefined();
});
it('refuses transition execution for a different mapped cell', async () => {
  process.argv = ['node', 'access', 'transition', 'mapping.json', cellId];
  mocks.readFile.mockResolvedValue(
    JSON.stringify({
      operator: tenantId,
      cell: otherCellId,
      platform: [],
      tenants: [],
    })
  );
  await import('../../src/scripts/access.js');
  expect(mocks.transition).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});
