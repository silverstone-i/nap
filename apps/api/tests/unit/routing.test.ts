/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it } from 'vitest';
import { routingConfiguration } from '../../src/util/routingConfig.js';
import { resolveRouterDatabase } from '../../src/util/env.js';

it('validates private origins without exposing input and ignores origins in cell mode', () => {
  expect(routingConfiguration({})).toBeUndefined();
  expect(
    routingConfiguration({ API_MODE: 'cell', CELL_API_ORIGINS: 'invalid' })
  ).toBeUndefined();
  expect(() => routingConfiguration({ API_MODE: 'other' })).toThrow(
    'Invalid API_MODE'
  );
  const valid = routingConfiguration({
    API_MODE: 'router',
    CELL_API_ORIGINS: JSON.stringify({
      a: 'http://127.0.0.1:3001',
      b: 'https://cell.internal',
    }),
  });
  expect(valid?.origins.get('b')).toBe('https://cell.internal');
  expect(() =>
    routingConfiguration({
      API_MODE: 'router',
      NODE_ENV: 'production',
      CELL_API_ORIGINS: JSON.stringify({ a: 'http://127.0.0.1:3001' }),
    })
  ).toThrow('Invalid CELL_API_ORIGINS');
  for (const value of [
    null,
    [],
    {},
    { a: 'http://public.example' },
    { a: 'https://user:secret@internal' },
    { a: 'https://internal/path' },
    { a: 'https://internal?redirect=secret' },
    { a: 'file:///secret' },
    { a: 'https://internal', b: 'https://internal/' },
  ]) {
    expect(() =>
      routingConfiguration({
        API_MODE: 'router',
        CELL_API_ORIGINS: JSON.stringify(value),
      })
    ).toThrow('Invalid CELL_API_ORIGINS');
  }
});

it('reads only the admin runtime URL for the router', () => {
  const env = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_URL_TEST: 'postgres://runtime:secret@localhost/admin',
  };
  expect(resolveRouterDatabase(env)).toBe(env.ADMIN_DATABASE_URL_TEST);
  expect(() => resolveRouterDatabase({ NODE_ENV: 'test' })).toThrow(
    'Invalid database configuration: ADMIN_DATABASE_URL_TEST'
  );
});
