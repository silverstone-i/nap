/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_cache_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
let handle, db;

beforeAll(async () => {
  await using(fixture, async tx => {
    for (const [role, password, attrs] of [
      ['nap-admin', config.adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', config.appPassword, 'NOCREATEDB NOCREATEROLE'],
    ]) {
      if (
        !(await tx.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await tx.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS ${attrs} PASSWORD $2`,
          [role, password]
        );
    }
  });
  await setupLocal(config);
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  db = handle.db;
}, 30000);

afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

it('reads missing keys as zero without creating rows', async () => {
  const entity = randomUUID();
  expect(
    await db.cache_revisions.current([{ domain: 'user', entity }])
  ).toEqual([{ domain: 'user', entity, revision: '0' }]);
  expect(
    Number(
      (
        await db.one(
          'SELECT count(*) FROM admin.cache_revisions WHERE entity=$1',
          [entity]
        )
      ).count
    )
  ).toBe(0);
});

it('advances multiple keys atomically and rolls back with source work', async () => {
  const tenantId = randomUUID();
  const userId = randomUUID();
  const keys = [
    { domain: 'tenant', entity: tenantId },
    { domain: 'user', entity: userId },
  ];
  const advanced = await db.tx(tx => db.cache_revisions.advance(keys, { tx }));
  expect(advanced.map(entry => entry.revision)).toEqual(['1', '1']);
  await expect(
    db.tx(async tx => {
      await db.cache_revisions.advance(keys, { tx });
      throw new Error('roll back');
    })
  ).rejects.toThrow('roll back');
  expect(await db.cache_revisions.current(keys)).toEqual(advanced);
});

it('serializes concurrent advances into a monotonic counter', async () => {
  const entity = randomUUID();
  const key = [{ domain: 'session', entity }];
  const revisions = await Promise.all(
    Array.from({ length: 8 }, () =>
      db.tx(tx => db.cache_revisions.advance(key, { tx }))
    )
  );
  expect(
    revisions.map(result => Number(result[0].revision)).sort((a, b) => a - b)
  ).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(await db.cache_revisions.current(key)).toEqual([
    { domain: 'session', entity, revision: '8' },
  ]);
});
