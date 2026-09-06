/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { resolvePort, resolveSetupConfiguration } from '../../src/util/env.js';

const env = {
  SETUP_ADMIN_URL_TEST: 'postgres://nap_admin:secret@localhost:5432/postgres',
  ADMIN_DATABASE_URL_TEST:
    'postgres://nap_app:secret@localhost:5432/nap_admin_test',
  ADMIN_MIGRATION_URL_TEST:
    'postgres://nap_admin:secret@localhost:5432/nap_admin_test',
  CELL_DATABASE_URL_TEST:
    'postgres://nap_app:secret@localhost:5432/nap_cell_test',
  CELL_MIGRATION_URL_TEST:
    'postgres://nap_admin:secret@localhost:5432/nap_cell_test',
  ADMIN_RUNTIME_ROLE: 'nap_app',
  CELL_RUNTIME_ROLE: 'nap_app',
};

describe('startup configuration', () => {
  it('defaults to 3000 and accepts a valid override', () => {
    expect(resolvePort({})).toBe(3000);
    expect(resolvePort({ PORT: '4321' })).toBe(4321);
  });
  it.each(['0', '65536', 'abc', '3000.1', '', '-1'])(
    'rejects invalid port %s',
    PORT => {
      expect(() => resolvePort({ PORT })).toThrow('PORT');
    }
  );
});

describe('setup configuration', () => {
  it('resolves distinct targets with one consistent runtime role', () => {
    expect(
      resolveSetupConfiguration('test', env).targets.map(t => t.database)
    ).toEqual(['nap_admin_test', 'nap_cell_test']);
  });
  it('refuses production setup', () => {
    expect(() => resolveSetupConfiguration('production', env)).toThrow('mode');
  });
  it.each([
    {
      CELL_DATABASE_URL_TEST: env.ADMIN_DATABASE_URL_TEST,
      CELL_MIGRATION_URL_TEST: env.ADMIN_MIGRATION_URL_TEST,
    },
    {
      CELL_DATABASE_URL_TEST:
        'postgres://nap_app:different@localhost:5432/nap_cell_test',
    },
    { ADMIN_RUNTIME_ROLE: 'nap_admin' },
    {
      CELL_MIGRATION_URL_TEST:
        'postgres://nap_admin:secret@elsewhere:5432/nap_cell_test',
    },
  ])('rejects inconsistent or overlapping configuration', overrides => {
    expect(() =>
      resolveSetupConfiguration('test', { ...env, ...overrides })
    ).toThrow();
  });
  it('does not include secrets in malformed configuration errors', () => {
    expect(() =>
      resolveSetupConfiguration('test', {
        ...env,
        SETUP_ADMIN_URL_TEST: 'secret-value',
      })
    ).toThrow('Invalid database configuration: SETUP_ADMIN_URL_TEST');
  });
});

it('rejects a password with a null byte without echoing credentials', () => {
  expect(() =>
    resolveSetupConfiguration('test', {
      ...env,
      SETUP_ADMIN_URL_TEST:
        'postgres://nap_admin:secret%00value@localhost/postgres',
    })
  ).toThrow('Invalid database configuration: SETUP_ADMIN_URL_TEST');
});
