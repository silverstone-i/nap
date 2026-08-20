/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  currentEnvironment,
  databaseUrl,
  databaseUrlVariable,
  runtimeRole,
} from '../../src/util/env.js';

describe('currentEnvironment', () => {
  it('defaults to development when NODE_ENV is unset', () => {
    expect(currentEnvironment({})).toBe('development');
  });

  it('rejects an unsupported NODE_ENV', () => {
    expect(() => currentEnvironment({ NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/
    );
  });
});

describe('databaseUrlVariable', () => {
  it('names the variable for each database and role', () => {
    expect(databaseUrlVariable('ADMIN', 'RUNTIME', 'production')).toBe(
      'ADMIN_DATABASE_URL_PROD'
    );
    expect(databaseUrlVariable('CELL', 'MIGRATION', 'test')).toBe(
      'CELL_MIGRATION_URL_TEST'
    );
  });
});

describe('databaseUrl', () => {
  it('reads the variable matching NODE_ENV', () => {
    const url = 'postgres://user:secret@localhost:5432/nap_cell_test';

    expect(
      databaseUrl('CELL', 'RUNTIME', {
        NODE_ENV: 'test',
        CELL_DATABASE_URL_TEST: url,
      })
    ).toBe(url);
  });

  it('names the missing variable without echoing any value', () => {
    expect(() =>
      databaseUrl('ADMIN', 'MIGRATION', { NODE_ENV: 'test' })
    ).toThrow('ADMIN_MIGRATION_URL_TEST is not set');
  });

  it('treats a blank value as unset', () => {
    expect(() =>
      databaseUrl('ADMIN', 'RUNTIME', {
        NODE_ENV: 'test',
        ADMIN_DATABASE_URL_TEST: '   ',
      })
    ).toThrow('ADMIN_DATABASE_URL_TEST is not set');
  });
});

describe('runtimeRole', () => {
  it('reads the configured role', () => {
    expect(runtimeRole('CELL', { CELL_RUNTIME_ROLE: 'nap_app' })).toBe(
      'nap_app'
    );
  });

  it('rejects a value that is not a bare identifier', () => {
    // The value reaches GRANT statements, which cannot parameterize a role.
    expect(() =>
      runtimeRole('CELL', {
        CELL_RUNTIME_ROLE: 'nap_app"; DROP SCHEMA cell; --',
      })
    ).toThrow(/identifier/);
  });
});
