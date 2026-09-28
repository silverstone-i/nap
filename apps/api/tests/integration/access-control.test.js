/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { using } from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateCell } from '../../src/application/maintenance/migrateCell.js';
import { verifyAccessControl } from '../../src/modules/access-control/schema/verify.js';
import {
  napsoftSeedPresent,
  seedNapsoft,
  setTenant,
} from '../../src/modules/access-control/seeds/napsoftSeed.js';
import { cellModules } from '../../src/modules/cell.js';
import { roleUrl } from '../../src/application/shared/configuration.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_acl_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
const napsoft = {
  tenantId: randomUUID(),
  tenantCode: 'NAP',
  portalUserId: randomUUID(),
};
const other = randomUUID();
let handle, app;

/**
 * Run `operation` in a transaction scoped to `tenantId`, or unscoped.
 * @param {object} target Cell handle.
 * @param {string|null} tenantId
 * @param {(tx: object) => Promise<T>} operation
 * @returns {Promise<T>}
 * @template T
 */
function inTenant(target, tenantId, operation) {
  return target.db.tx(async tx => {
    if (tenantId) await setTenant(tx, tenantId);
    return operation(tx);
  });
}

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
  expect((await migrateCell(config)).status).toBe('applied');
  handle = createCellDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  app = createCellDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  await app.connect();
}, 30000);

afterAll(async () => {
  await app?.close();
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

it('creates the three role tables with forced tenant RLS and a clean contract; reruns are no-ops (M0003 AC01)', async () => {
  const tables = await handle.db.any(
    `SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND c.relkind='r' AND c.relname<>'schema_migrations'
      ORDER BY c.relname`
  );
  expect(tables).toEqual([
    { name: 'role_assignments', rls: true, force: true },
    { name: 'role_grants', rls: true, force: true },
    { name: 'roles', rls: true, force: true },
  ]);
  await verifyAccessControl(handle, cellModules);
  expect((await migrateCell(config)).status).toBe('unchanged');
});

it('returns no rows and rejects writes with no tenant setting, for nap-app and nap-admin', async () => {
  await inTenant(handle, napsoft.tenantId, tx =>
    handle.db.roles.insert(
      { tenant_id: napsoft.tenantId, code: 'visible', name: 'Visible' },
      { tx }
    )
  );
  for (const target of [app, handle]) {
    expect(
      await inTenant(target, null, tx => tx.any('SELECT id FROM app.roles'))
    ).toEqual([]);
    await expect(
      inTenant(target, null, tx =>
        tx.none(
          "INSERT INTO app.roles (tenant_id, code, name) VALUES ($1, 'x', 'X')",
          [napsoft.tenantId]
        )
      )
    ).rejects.toThrow();
  }
  expect(
    await inTenant(app, napsoft.tenantId, tx =>
      tx.any('SELECT code FROM app.roles')
    )
  ).toEqual([{ code: 'visible' }]);
  expect(
    await inTenant(app, other, tx => tx.any('SELECT code FROM app.roles'))
  ).toEqual([]);
});

it('rejects a malformed pattern and a change to is_immutable (M0003-R003, §7)', async () => {
  await inTenant(handle, napsoft.tenantId, async tx => {
    const role = await handle.db.roles.lockByCode(napsoft.tenantId, 'visible', {
      tx,
    });
    for (const pattern of [
      'NAP::a::b::read',
      '*::*::*::*',
      'NAP-1::admin-tenancy::control::write',
    ])
      await tx.none(
        'INSERT INTO app.role_grants (tenant_id, role_id, pattern) VALUES ($1,$2,$3)',
        [napsoft.tenantId, role.id, pattern]
      );
  });
  for (const pattern of [
    'nap::*::*::*',
    '*::*::*',
    '*::*::*::*::*',
    '*::Admin::*::*',
    '*::a_b::*::*',
    '::*::*::*',
  ])
    await expect(
      inTenant(handle, napsoft.tenantId, async tx => {
        const role = await handle.db.roles.lockByCode(
          napsoft.tenantId,
          'visible',
          { tx }
        );
        await tx.none(
          'INSERT INTO app.role_grants (tenant_id, role_id, pattern) VALUES ($1,$2,$3)',
          [napsoft.tenantId, role.id, pattern]
        );
      })
    ).rejects.toThrow();
  await expect(
    inTenant(handle, napsoft.tenantId, tx =>
      tx.none("UPDATE app.roles SET is_immutable=true WHERE code='visible'")
    )
  ).rejects.toThrow(/Immutable field/);
});

it('seeds the Napsoft roles and assignment once, and a rerun changes nothing (M0003 AC04)', async () => {
  const first = await inTenant(handle, napsoft.tenantId, tx =>
    seedNapsoft(handle.db, tx, napsoft)
  );
  expect(first.created).toEqual(['platform_admin', 'support', 'tenant_admin']);
  const snapshot = () =>
    inTenant(handle, napsoft.tenantId, tx =>
      tx.any(
        `SELECT r.code,r.is_immutable,g.pattern FROM app.roles r
           LEFT JOIN app.role_grants g ON g.role_id=r.id
          WHERE r.code<>'visible' ORDER BY r.code,g.pattern`
      )
    );
  const before = await snapshot();
  expect(before).toEqual([
    { code: 'platform_admin', is_immutable: true, pattern: '*::*::*::*' },
    { code: 'platform_admin', is_immutable: true, pattern: 'NAP::*::*::*' },
    { code: 'support', is_immutable: true, pattern: '*::*::*::read' },
    { code: 'tenant_admin', is_immutable: true, pattern: 'NAP::*::*::*' },
  ]);
  const second = await inTenant(handle, napsoft.tenantId, tx =>
    seedNapsoft(handle.db, tx, napsoft)
  );
  expect(second).toEqual({ created: [], assignmentId: first.assignmentId });
  expect(await snapshot()).toEqual(before);
  expect(
    await inTenant(handle, napsoft.tenantId, tx =>
      tx.any(
        `SELECT a.portal_user_id,r.code FROM app.role_assignments a
           JOIN app.roles r ON r.id=a.role_id WHERE a.deactivated_at IS NULL`
      )
    )
  ).toEqual([{ portal_user_id: napsoft.portalUserId, code: 'platform_admin' }]);
  expect(
    await inTenant(handle, null, tx =>
      napsoftSeedPresent(handle.db, tx, napsoft)
    )
  ).toBe(true);
});

it('fails the seed when a seeded role has drifted, and the readback reports it (M0003-R010)', async () => {
  await inTenant(handle, napsoft.tenantId, async tx => {
    const role = await handle.db.roles.lockByCode(napsoft.tenantId, 'support', {
      tx,
    });
    await handle.db.role_grants.insert(
      {
        tenant_id: napsoft.tenantId,
        role_id: role.id,
        pattern: '*::*::*::write',
      },
      { tx }
    );
  });
  await expect(
    inTenant(handle, napsoft.tenantId, tx =>
      seedNapsoft(handle.db, tx, napsoft)
    )
  ).rejects.toMatchObject({ code: 'SEED_DRIFT' });
  expect(
    await inTenant(handle, null, tx =>
      napsoftSeedPresent(handle.db, tx, napsoft)
    )
  ).toBe(false);
});
