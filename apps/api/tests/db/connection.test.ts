/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import { getDb, resolveConnectionString } from '../../src/db/index.js';

// This file must never call initDb(): the pre-init getDb() assertion below
// depends on the singleton staying untouched. Lifecycle tests live in
// connection-singleton.test.ts (vitest isolates state per test file).

describe('resolveConnectionString', () => {
  it('selects DATABASE_URL_PROD when NODE_ENV is production', () => {
    const url = resolveConnectionString({
      NODE_ENV: 'production',
      DATABASE_URL_PROD: 'postgres://prod',
      DATABASE_URL_DEV: 'postgres://dev',
    });
    expect(url).toBe('postgres://prod');
  });

  it('selects DATABASE_URL_TEST when NODE_ENV is test', () => {
    const url = resolveConnectionString({
      NODE_ENV: 'test',
      DATABASE_URL_TEST: 'postgres://test',
      DATABASE_URL_DEV: 'postgres://dev',
    });
    expect(url).toBe('postgres://test');
  });

  it('falls back to DATABASE_URL_DEV for any other NODE_ENV', () => {
    for (const NODE_ENV of [undefined, 'development', 'staging']) {
      const url = resolveConnectionString({
        NODE_ENV,
        DATABASE_URL_DEV: 'postgres://dev',
      });
      expect(url).toBe('postgres://dev');
    }
  });

  it('trims surrounding whitespace', () => {
    const url = resolveConnectionString({
      DATABASE_URL_DEV: '  postgres://dev  ',
    });
    expect(url).toBe('postgres://dev');
  });

  it('throws naming the missing variable and the NODE_ENV that selected it', () => {
    expect(() => resolveConnectionString({ NODE_ENV: 'test' })).toThrow(
      'DATABASE_URL_TEST is not set (required because NODE_ENV is "test")'
    );
  });

  it('treats a whitespace-only value as missing', () => {
    expect(() => resolveConnectionString({ DATABASE_URL_DEV: '   ' })).toThrow(
      'DATABASE_URL_DEV is not set'
    );
  });
});

describe('getDb', () => {
  it('throws before initDb has run', () => {
    expect(() => getDb()).toThrow('call initDb() at startup');
  });
});
