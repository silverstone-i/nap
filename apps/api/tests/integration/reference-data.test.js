/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { registerCell } from '../../src/modules/admin-tenancy/domain/cells.js';
import { bootstrapNapsoft } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { selectTenant } from '../../src/modules/admin-tenancy/domain/tenantAccess.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';
import { referenceDataRoutesV1 } from '../../src/modules/reference-data/apiRoutes/v1/index.js';
import {
  SEED_VERSION,
  seedReferenceData,
} from '../../src/modules/reference-data/seeds/referenceSeed.js';
import snapshot from '../../src/modules/reference-data/seeds/snapshot.json' with { type: 'json' };

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
const sessionPolicy = {
  secret: 'integration-reference-data-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const ORIGIN = 'http://localhost:5173';
const BASE = '/api/reference-data/v1';
const created = new Set();
let handle, db, dir, registry, cell, cellId, cellName, app, napsoft, rootId;
let cookie;

function call(path, as = cookie) {
  return request(app)
    .get(BASE + path)
    .set('Origin', ORIGIN)
    .set('Cookie', as);
}

/** Run `work` against the provisioned cell as `nap-admin`. */
async function asAdmin(work) {
  const admin = createCellDatabase(
    roleUrl(url.host + '/' + cellName, 'nap-admin', config.adminPassword)
  );
  await admin.connect();
  try {
    return await work(admin.db);
  } finally {
    await admin.close();
  }
}

/**
 * Create an active Napsoft employee, admin and cell side, with no role, with a session that has selected Napsoft.
 * @returns {Promise<{id: string, cookie: string}>}
 */
async function staff() {
  const memberId = randomUUID();
  const user = await db.tx(tx =>
    db.portal_users.insertBootstrapLogin(
      { email: `staff-${randomUUID()}@nap.test`, passwordHash: 'unused' },
      { tx }
    )
  );
  await db.portal_user_tenants.insert({
    portal_user_id: user.id,
    tenant_id: napsoft.id,
    member_type: 'employee',
    member_id: memberId,
    status: 'active',
    ready: true,
  });
  await cell.tenant_members.insert({
    id: randomUUID(),
    tenant_id: napsoft.id,
    portal_user_id: user.id,
    member_type: 'employee',
    member_id: memberId,
    status: 'active',
    revision: 1,
  });
  const session = await createSession(db, sessionPolicy, {
    portalUserId: user.id,
  });
  const selected = await selectTenant(
    db,
    sessionPolicy,
    session.token,
    { user: user.id },
    { tenant: napsoft.id },
    { runtime: registry }
  );
  return { id: user.id, cookie: `nap_session=${selected.token}` };
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
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  db = handle.db;

  const unique = randomUUID().slice(0, 8);
  const boot = await bootstrapNapsoft(db, {
    tenantCode: `NAP-${unique.toUpperCase()}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `bootstrap-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  rootId = boot.login.id;

  dir = await mkdtemp(join(tmpdir(), 'nap-reference-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'A=1\n', { mode: 0o600 });
  const driver = createLocalCellDriver({
    adminPassword: config.adminPassword,
    appPassword: config.appPassword,
    setup: config.maintenance,
    stateFile: join(dir, 'state.json'),
    envFile,
  });
  registry = createCellRegistry({ admin: db });
  const provisioning = createProvisioningWorker({
    admin: { db },
    driver,
    stages: createStages({ driver, registry, environment: 'test' }),
    intervalMs: 5,
  });
  const registered = await registerCell(
    db,
    'test',
    { actorId: randomUUID(), granted: true },
    { operation: 'cell', suffix: 'a' + randomUUID().slice(0, 8) }
  );
  created.add(registered.cell.database_name);
  await provisioning.tick();
  cellId = registered.cell.id;
  cellName = registered.cell.database_name;
  cell = registry.dbFor(cellId);
  napsoft = await db.tenants.findOneBy(
    { id: boot.tenant.id },
    { columnWhitelist: ['id', 'tenant_code', 'rbac_ready'] }
  );
  expect(napsoft.rbac_ready).toBe(true);

  const other = await createSession(db, sessionPolicy, {
    portalUserId: rootId,
  });
  const selected = await selectTenant(
    db,
    sessionPolicy,
    other.token,
    { user: rootId },
    { tenant: napsoft.id },
    { runtime: registry }
  );
  cookie = `nap_session=${selected.token}`;

  app = createApp({
    api: {
      admin: handle,
      environment: 'test',
      sessionPolicy,
      cookiePolicy: { secure: false, sameSite: 'lax' },
      applicationOrigin: ORIGIN,
      runtime: registry,
      registrations: referenceDataRoutesV1,
    },
  });
}, 120000);

afterAll(async () => {
  await registry?.close();
  await handle?.close();
  await using(fixture, async tx => {
    for (const database of [...created, name])
      await tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [database]);
  });
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('reference-data seed (M0004-R001–R005)', () => {
  it('provisioning loads every snapshot row and records the version', async () => {
    const [countries, currencies, versions] = await Promise.all([
      cell.countries.listByName(),
      cell.currencies.listByName(),
      cell.seed_versions.findWhere({ version: SEED_VERSION }),
    ]);
    expect(countries).toHaveLength(snapshot.countries.length);
    expect(currencies).toHaveLength(snapshot.currencies.length);
    expect(versions).toHaveLength(1);
    expect(currencies.find(c => c.code === 'JPY').minorUnit).toBe(0);
    expect(countries.find(c => c.code === 'AL').numericCode).toBe('008');
  });

  it('reseeding the same version changes nothing', async () => {
    const before = await asAdmin(tx =>
      tx.one(
        "SELECT (SELECT count(*) FROM reference.countries)::int AS c, (SELECT xmin::text FROM reference.currencies WHERE code='USD') AS x"
      )
    );
    await asAdmin(tx => seedReferenceData(tx));
    const after = await asAdmin(tx =>
      tx.one(
        "SELECT (SELECT count(*) FROM reference.countries)::int AS c, (SELECT xmin::text FROM reference.currencies WHERE code='USD') AS x"
      )
    );
    expect(after).toEqual(before);
  });

  it('nap-app can read but not write reference tables', async () => {
    await expect(
      cell.countries.db.none(
        "INSERT INTO reference.countries VALUES ('ZZ','ZZZ','999','Nowhere')"
      )
    ).rejects.toThrow(/permission denied/);
  });
});

describe('reference-data readiness (M0004-R007)', () => {
  it('a cell without the seed version is not ready until reseeded', async () => {
    await asAdmin(tx => tx.none('DELETE FROM reference.seed_versions'));
    expect(await registry.recheck(cellId)).toEqual({
      ready: false,
      reason: 'SEED_MISSING',
    });
    await asAdmin(tx => seedReferenceData(tx));
    expect(await registry.recheck(cellId)).toEqual({ ready: true });
  });
});

describe('reference-data routes (M0004-R008)', () => {
  it('returns countries and currencies sorted by name', async () => {
    for (const path of ['/countries', '/currencies']) {
      const response = await call(path);
      expect(response.status).toBe(200);
      const table = path.slice(1);
      expect(response.body.data).toEqual(await cell[table].listByName());
    }
    const usd = (await call('/currencies')).body.data.find(
      c => c.code === 'USD'
    );
    expect(usd).toEqual({
      code: 'USD',
      numericCode: '840',
      name: 'US Dollar',
      minorUnit: 2,
    });
  });

  it('denies a member without the lookup capability', async () => {
    const none = await staff();
    expect((await call('/countries', none.cookie)).status).toBe(403);
  });
});
