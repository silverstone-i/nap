/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { defineMigration } from 'pg-schemata';
import { using } from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateCell } from '../../src/application/maintenance/migrateCell.js';
import { verifyCell } from '../../src/modules/cell-tenancy/schema/verify.js';
import { cellModules } from '../../src/modules/cell.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_cell_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
const asApp = operation =>
  using(roleUrl(config.endpoint, 'nap-app', config.appPassword), operation);
const tenantA = randomUUID();
const tenantB = randomUUID();
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
  expect((await setupLocal(config)).status).toBe('created');
  handle = createCellDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
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
it('migrates concurrently once, passes the catalog check, and leaves every table empty', async () => {
  const results = await Promise.all([migrateCell(config), migrateCell(config)]);
  expect(results.map(r => r.status).sort()).toEqual(['applied', 'unchanged']);
  expect(results[0].database).toBe(name);
  for (const table of Object.keys(cellModules[0].models))
    expect(
      Number((await db.one('SELECT count(*) FROM cell.$1:name', [table])).count)
    ).toBe(0);
  await verifyCell(handle, cellModules);
  expect((await migrateCell(config)).status).toBe('unchanged');
});
it('lets nap-app read the identity and read and write every tenant row with no tenant setting', async () => {
  for (const [id, code] of [
    [tenantA, 'ALPHA'],
    [tenantB, 'BETA'],
  ]) {
    await db.none(
      "INSERT INTO cell.tenants(id,tenant_code,status,revision) VALUES($1,$2,'active',1)",
      [id, code]
    );
  }
  await db.none(
    "INSERT INTO cell.physical_identity(cell_id,database_name,operation_id,environment) VALUES($1,$2,$3,'test')",
    [randomUUID(), name, randomUUID()]
  );
  const rls = await db.any(
    "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cell' AND (c.relrowsecurity OR c.relforcerowsecurity)"
  );
  expect(rls).toEqual([]);
  await asApp(async app => {
    expect(
      (await app.one('SELECT database_name FROM cell.physical_identity'))
        .database_name
    ).toBe(name);
    expect(
      Number((await app.one('SELECT count(*) FROM cell.tenants')).count)
    ).toBe(2);
    await app.none(
      "INSERT INTO cell.outbox(tenant_id,topic,entity_id,revision) VALUES($1,'portal_access',$2,1),($3,'portal_access',$4,1)",
      [tenantA, randomUUID(), tenantB, randomUUID()]
    );
    expect(
      Number((await app.one('SELECT count(*) FROM cell.outbox')).count)
    ).toBe(2);
  });
});
it('refuses DDL from nap-app, a second identity row, and changes to the identity', async () => {
  await asApp(async app => {
    await expect(
      app.none('CREATE TABLE cell.intruder(id int)')
    ).rejects.toThrow(/permission denied/);
    await expect(
      app.none('ALTER TABLE cell.tenants ADD COLUMN x int')
    ).rejects.toThrow(/must be owner/);
    await expect(
      app.none("UPDATE cell.physical_identity SET environment='prod'")
    ).rejects.toThrow(/permission denied/);
  });
  await expect(
    db.none(
      "INSERT INTO cell.physical_identity(cell_id,database_name,operation_id,environment) VALUES($1,'other',$2,'test')",
      [randomUUID(), randomUUID()]
    )
  ).rejects.toThrow(/physical_identity_single_row/);
  await expect(
    db.none("UPDATE cell.physical_identity SET environment='prod'")
  ).rejects.toThrow(/Immutable field/);
});
it('keeps every foreign key inside the cell schema', async () => {
  const outside = await db.any(
    `SELECT x.conname FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class r ON r.oid=x.confrelid JOIN pg_namespace rn ON rn.oid=r.relnamespace WHERE x.contype='f' AND n.nspname='cell' AND rn.nspname<>'cell'`
  );
  expect(outside).toEqual([]);
});
it('records nothing for a failed migration and rejects a changed applied migration', async () => {
  const broken = {
    name: 'broken-module',
    databaseTarget: 'cell',
    schema: 'cell',
    entitlementType: 'infrastructure',
    models: {},
    migrations: [
      defineMigration({
        id: '001-broken',
        up: async () => {
          throw new Error('boom');
        },
      }),
    ],
  };
  await expect(migrateCell(config, [...cellModules, broken])).rejects.toThrow();
  expect(
    await db.any(
      "SELECT 1 FROM cell.schema_migrations WHERE module_name='broken-module'"
    )
  ).toEqual([]);
  const drifted = {
    ...cellModules[0],
    migrations: [
      defineMigration({ id: '001-cell-tenancy', up: async () => {} }),
    ],
  };
  await expect(migrateCell(config, [drifted])).rejects.toThrow(/checksum/i);
});
it('reports failures without credentials', async () => {
  const wrong = { ...config, adminPassword: 'not-the-password-7f3a' };
  const error = await migrateCell(wrong).catch(e => e);
  expect(error).toBeInstanceOf(Error);
  const text = String(error.message) + JSON.stringify(error);
  expect(text).not.toContain('not-the-password-7f3a');
  expect(text).not.toContain(config.adminPassword);
});
