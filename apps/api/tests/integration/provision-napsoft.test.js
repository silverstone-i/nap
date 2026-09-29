/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { bootstrapNapsoft } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';
import {
  NAPSOFT_CELL_SUFFIX,
  provisionNapsoft,
} from '../../src/application/maintenance/provisionNapsoft.js';
import { setTenant } from '../../src/modules/access-control/seeds/napsoftSeed.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_test_' + randomUUID().replaceAll('-', '');
const cellName = `nap_test_cell_${NAPSOFT_CELL_SUFFIX}`;
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
let handle, db, dir, driver, registry, worker, boot;

const dropCell = () =>
  using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [cellName])
  );

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
  await dropCell();
  await setupLocal(config);
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  await handle.connect();
  db = handle.db;
  const unique = randomUUID().slice(0, 8);
  boot = await bootstrapNapsoft(db, {
    tenantCode: `NAP-${unique.toUpperCase()}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `login-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  dir = await mkdtemp(join(tmpdir(), 'nap-provision-napsoft-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'A=1\n', { mode: 0o600 });
  driver = createLocalCellDriver({
    adminPassword: config.adminPassword,
    appPassword: config.appPassword,
    setup: config.maintenance,
    stateFile: join(dir, 'state.json'),
    envFile,
  });
  registry = createCellRegistry({ admin: db });
  worker = createProvisioningWorker({
    admin: handle,
    driver,
    stages: createStages({ driver, registry, environment: 'test' }),
  });
}, 60000);

afterAll(async () => {
  await registry?.close();
  await handle?.close();
  await dropCell();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
  if (dir) await rm(dir, { recursive: true, force: true });
});

it('provisions the first cell and runs Napsoft tenant setup with the seed (I0003-R042, AC14)', async () => {
  const result = await provisionNapsoft(db, {
    environment: 'test',
    worker,
    driver,
  });
  expect(result).toMatchObject({
    status: 'provisioned',
    database: cellName,
    tenant: boot.tenant.id,
  });
  expect(
    await db.tenants.findOneBy(
      { id: boot.tenant.id },
      { columnWhitelist: ['cell_id', 'provisioned', 'rbac_ready'] }
    )
  ).toEqual({ cell_id: result.cell, provisioned: true, rbac_ready: true });

  const cell = createCellDatabase(
    roleUrl(`${url.host}/${cellName}`, 'nap-admin', config.adminPassword)
  );
  try {
    await cell.connect();
    const rows = await cell.db.tx(async tx => {
      await setTenant(tx, boot.tenant.id);
      return tx.any(
        `SELECT r.code, a.portal_user_id FROM app.roles r
           LEFT JOIN app.role_assignments a ON a.role_id=r.id
          ORDER BY r.code`
      );
    });
    expect(rows).toEqual([
      { code: 'platform_admin', portal_user_id: boot.login.id },
      { code: 'support', portal_user_id: null },
      { code: 'tenant_admin', portal_user_id: null },
    ]);
    // M0005-R017, R023: default labels, and no employee record for root.
    const directory = await cell.db.tx(async tx => {
      await setTenant(tx, boot.tenant.id);
      return tx.one(
        `SELECT (SELECT count(*)::int FROM app.contact_labels) AS labels,
                (SELECT count(*)::int FROM app.parties) AS parties`
      );
    });
    expect(directory).toEqual({ labels: 13, parties: 0 });
    const member = await cell.db.tenant_members.findOneBy(
      { portal_user_id: boot.login.id },
      { columnWhitelist: ['member_type', 'member_id'] }
    );
    expect(member).toEqual({ member_type: null, member_id: null });
  } finally {
    await cell.close();
  }
});

it('refuses to run once the Napsoft tenant has a cell', async () => {
  const before = await db.cells.countAll({ includeDeactivated: true });
  await expect(
    provisionNapsoft(db, { environment: 'test', worker, driver })
  ).rejects.toMatchObject({ code: 'NAPSOFT_CELL_EXISTS' });
  expect(await db.cells.countAll({ includeDeactivated: true })).toBe(before);
});
