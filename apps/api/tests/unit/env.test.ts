/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it } from 'vitest';
import {
  resolvePort,
  resolveSetupConfiguration,
  resolveTrustProxyHops,
  environmentValue,
} from '../../src/util/env.js';
const id = '00000000-0000-4000-8000-000000000001';
const env = {
  NODE_ENV: 'test',
  SETUP_DATABASE_TEST: 'localhost:5432/postgres',
  ADMIN_DATABASE_TEST: 'localhost:5432/nap_admin_test',
  CELL_DATABASES_TEST: JSON.stringify({ [id]: 'localhost:5432/nap_cell_test' }),
  NAP_APP_PSWD_TEST: 'app-secret',
  NAP_ADMIN_PSWD_TEST: 'owner-secret',
};
it('defaults the process port and checks explicit overrides', () => {
  expect(resolvePort({})).toBe(3000);
  expect(resolvePort({ PORT: '4321' })).toBe(4321);
  for (const PORT of ['0', '65536', 'abc', '3000.1', '', '-1'])
    expect(() => resolvePort({ PORT })).toThrow('PORT');
});
it('selects proxy trust by environment and rejects invalid counts', () => {
  expect(resolveTrustProxyHops({})).toBe(0);
  expect(
    resolveTrustProxyHops({
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS_PROD: '2',
      TRUST_PROXY_HOPS_DEV: '0',
    })
  ).toBe(2);
  for (const value of ['-1', '17', 'one', '1.5', ''])
    expect(() =>
      resolveTrustProxyHops({ TRUST_PROXY_HOPS_DEV: value })
    ).toThrow('TRUST_PROXY_HOPS');
});
it('reads only the selected environment setting', () => {
  expect(
    environmentValue('ROOT_EMAIL', {
      NODE_ENV: 'test',
      ROOT_EMAIL_TEST: 'test@nap.test',
      ROOT_EMAIL_DEV: 'dev@nap.test',
    })
  ).toBe('test@nap.test');
});
it('builds existing setup inputs with fixed roles and an explicit cell', () => {
  const result = resolveSetupConfiguration('test', env, id);
  expect(result.targets.map(t => t.database)).toEqual([
    'nap_admin_test',
    'nap_cell_test',
  ]);
  expect(
    result.targets.every(
      t =>
        t.user === 'nap_app' &&
        t.password === 'app-secret' &&
        t.owner === 'nap_admin'
    )
  ).toBe(true);
  expect(result.setup.password).toBe('owner-secret');
  expect(() => resolveSetupConfiguration('production', env, id)).toThrow(
    'mode'
  );
  expect(() => resolveSetupConfiguration('test', env)).toThrow('--cell-id');
});
it.each([
  'elsewhere/cell',
  'localhost/postgres',
  'localhost/admin?sslmode=require',
])('rejects incompatible local setup endpoints', value => {
  expect(() =>
    resolveSetupConfiguration(
      'test',
      { ...env, CELL_DATABASES_TEST: JSON.stringify({ [id]: value }) },
      id
    )
  ).toThrow();
});
