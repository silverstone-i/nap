/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it } from 'vitest';
import {
  resolveRuntimeConfiguration,
  resolveMigrationConfiguration,
  resolveCellMaintenanceConfiguration,
  resolveEnvironment,
  resolveDatabaseArguments,
} from '../../src/util/env.js';
const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
/**
 * Does: Supplies local configuration with no dependency on the developer's environment.
 * Called by: configuration unit tests.
 */
function env(values: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'localhost/admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    NAP_ADMIN_PSWD_TEST: 'owner-secret',
    ...values,
  };
}
it('selects environments and accepts admin-only configuration', () => {
  expect(resolveEnvironment({})).toBe('DEV');
  expect(resolveEnvironment({ NODE_ENV: 'test' })).toBe('TEST');
  expect(resolveEnvironment({ NODE_ENV: 'production' })).toBe('PROD');
  expect(() => resolveEnvironment({ NODE_ENV: '' })).toThrow('NODE_ENV');
  expect(
    resolveRuntimeConfiguration(
      env({ NAP_ADMIN_PSWD_TEST: undefined, ADMIN_DATABASE_PROD: '' })
    )
  ).toEqual({
    admin: 'postgres://nap_app:runtime-secret@localhost/admin',
    cells: new Map(),
  });
});
it('builds two runtime URLs from shared local credentials and distinct endpoints', () => {
  const config = env({
    CELL_DATABASES_TEST: JSON.stringify({
      [first]: 'localhost/cell_1',
      [second]: 'localhost/cell_2',
    }),
  });
  expect([...resolveRuntimeConfiguration(config).cells.values()]).toEqual([
    'postgres://nap_app:runtime-secret@localhost/cell_1',
    'postgres://nap_app:runtime-secret@localhost/cell_2',
  ]);
  expect(resolveCellMaintenanceConfiguration(second, config)).toBe(
    'postgres://nap_admin:owner-secret@localhost/cell_2'
  );
  expect(() => resolveCellMaintenanceConfiguration(first, env())).toThrow(
    'Unconfigured'
  );
});
it('reads only the operation password and preserves TLS options and encoded credentials', () => {
  const password = 'p%a:ss@/?# word';
  const config = {
    NODE_ENV: 'production',
    ADMIN_DATABASE_PROD: JSON.stringify({
      endpoint: 'host/admin?sslmode=require&application_name=nap',
      appPassword: password,
    }),
    CELL_DATABASES_PROD: JSON.stringify({
      [first]: { endpoint: 'cell-host/cell', appPassword: 'cell-secret' },
    }),
  };
  const runtime = resolveRuntimeConfiguration(config);
  expect(decodeURIComponent(new URL(runtime.admin).password)).toBe(password);
  expect(new URL(runtime.admin).search).toBe(
    '?sslmode=require&application_name=nap'
  );
  expect(new URL(runtime.cells.get(first) ?? '').password).toBe('cell-secret');
  expect(() => resolveMigrationConfiguration('admin', config)).toThrow(
    'ADMIN_DATABASE_PROD'
  );
  expect(
    resolveMigrationConfiguration(
      'cell',
      {
        NODE_ENV: 'production',
        CELL_DATABASES_PROD: JSON.stringify({
          [first]: {
            endpoint: 'cell-host/cell',
            adminPassword: 'owner-secret',
          },
        }),
      },
      first
    )
  ).toBe('postgres://nap_admin:owner-secret@cell-host/cell');
  expect(
    resolveMigrationConfiguration(
      'admin',
      env({ NAP_APP_PSWD_TEST: undefined })
    )
  ).toContain('nap_admin:');
});
it.each([
  'API_MODE',
  'CELL_CODE',
  'CELL_API_ORIGINS',
  'CELL_DATABASE_URL_DEV',
  'CELL_DATABASE_URLS_TEST',
  'ADMIN_MIGRATION_URL_PROD',
  'CELL_SETUP_RUNTIME_URL_TEST',
  'ADMIN_RUNTIME_ROLE',
  'SESSION_SECRET',
  'REDIS_URL',
])('rejects obsolete %s without its value', name => {
  expect(() =>
    resolveRuntimeConfiguration(env({ [name]: 'private-value' }))
  ).toThrow(`Obsolete configuration: ${name}`);
});
it.each([
  '[]',
  'null',
  '{',
  '{"cell-1":"host/db"}',
  JSON.stringify({ [first]: 'localhost/admin' }),
  JSON.stringify({
    [first]: 'localhost/cell',
    [second]: 'LOCALHOST:5432/%63ell',
  }),
  JSON.stringify({
    ['abcdefab-0000-4000-8000-000000000001']: 'h/a',
    ['ABCDEFAB-0000-4000-8000-000000000001']: 'h/b',
  }),
])('rejects invalid maps and overlapping targets', value => {
  expect(() =>
    resolveRuntimeConfiguration(env({ CELL_DATABASES_TEST: value }))
  ).toThrow('Invalid database configuration: CELL_DATABASES_TEST');
});
it.each([
  '',
  'private-value',
  'postgres://user:secret@host/db',
  'user:secret@host/db',
  'host/db?host=elsewhere',
  'host/db?options=-crole=owner',
  'host/db#fragment',
  'host/',
  'host/db%00',
  'host:0/db',
  'host/db/other',
])('rejects invalid endpoints without disclosing input', value => {
  expect(() =>
    resolveMigrationConfiguration('admin', env({ ADMIN_DATABASE_TEST: value }))
  ).toThrow('Invalid database configuration: ADMIN_DATABASE_TEST');
});
it.each(['', '<generated-password>', 'change-me', 'private\0password'])(
  'rejects missing or placeholder role secrets',
  value => {
    expect(() =>
      resolveRuntimeConfiguration(env({ NAP_APP_PSWD_TEST: value }))
    ).toThrow('Invalid database configuration: NAP_APP_PSWD_TEST');
  }
);
it('requires an explicit UUID and acknowledgement for selected maintenance commands', () => {
  expect(
    resolveDatabaseArguments(['--target', 'cell', '--cell-id', first])
  ).toEqual({ target: 'cell', cellId: first });
  expect(
    resolveDatabaseArguments(['--target', 'admin', '--confirm'], true)
  ).toEqual({ target: 'admin', cellId: undefined });
  for (const args of [
    ['--target', 'cell'],
    ['--target', 'cell', '--cell-id', 'bad'],
    ['--target', 'admin', '--cell-id', first],
  ])
    expect(() => resolveDatabaseArguments(args)).toThrow();
  expect(() =>
    resolveDatabaseArguments(['--target', 'cell', '--cell-id', first], true)
  ).toThrow('--confirm');
  expect(() => resolveMigrationConfiguration('cell', env())).toThrow(
    '--cell-id'
  );
});

it('rejects duplicate JSON keys including escaped UUID spellings', () => {
  for (const duplicate of [first, first.replace('0', '\\u0030')]) {
    const source = `{"${first}":"host/one","${duplicate}":"host/two"}`;
    expect(() =>
      resolveRuntimeConfiguration(env({ CELL_DATABASES_TEST: source }))
    ).toThrow('CELL_DATABASES_TEST');
  }
});
