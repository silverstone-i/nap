/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import {
  activateCell,
  claimCellProvisioning,
  disableCell,
  registerCell,
  retryCellProvisioning,
} from '../../src/modules/admin-tenancy/domain/cells.js';
import { bootstrapRoot } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { selectTenant } from '../../src/modules/admin-tenancy/domain/tenantAccess.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import {
  createLocalCellDriver,
  operationMarker,
} from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';

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
  secret: 'integration-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const created = new Set();
let handle, db, dir, provisioning, rootUser, napsoftId;

const suffix = () => 'p' + randomUUID().replaceAll('-', '').slice(0, 12);
const authority = () => ({
  actorId: randomUUID(),
  granted: true,
  deniedTenantIds: [],
});

/**
 * Build the worker exactly as `server.js` does, around one registry.
 * @param {{registry?: object, stages?: object, driver?: object}} [overrides]
 */
function system(overrides = {}) {
  const driver = overrides.driver ?? createLocalCellDriver(provisioning);
  const registry = overrides.registry ?? createCellRegistry({ admin: db });
  const stages =
    overrides.stages ?? createStages({ driver, registry, environment: 'test' });
  const worker = createProvisioningWorker({
    admin: { db },
    driver,
    stages,
    intervalMs: 5,
  });
  return { driver, registry, stages, worker };
}

async function register() {
  const result = await registerCell(db, 'test', authority(), {
    operation: 'cell',
    suffix: suffix(),
  });
  created.add(result.cell.database_name);
  return result;
}

const job = cellId =>
  db.one('SELECT * FROM admin.cell_provisioning WHERE cell_id=$1', [cellId]);
const napsoft = () =>
  db.one('SELECT * FROM admin.tenants WHERE id=$1', [napsoftId]);

async function publishedMap() {
  const env = parseEnv(await readFile(provisioning.envFile, 'utf8'));
  return JSON.parse(env.CELL_DATABASES_DEV ?? '{}');
}

async function select(registry) {
  const { token, session } = await createSession(db, sessionPolicy, {
    portalUserId: rootUser.id,
  });
  return selectTenant(
    db,
    sessionPolicy,
    token,
    session,
    { tenant: napsoftId },
    { runtime: registry }
  );
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
  const boot = await bootstrapRoot(db, {
    tenantCode: `NAP-${unique}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `root-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  rootUser = boot.rootUser;
  napsoftId = boot.tenant.id;

  dir = await mkdtemp(join(tmpdir(), 'nap-cells-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'A=1\n', { mode: 0o600 });
  provisioning = {
    adminPassword: config.adminPassword,
    appPassword: config.appPassword,
    setup: config.maintenance,
    stateFile: join(dir, 'state.json'),
    envFile,
  };
}, 60000);

afterAll(async () => {
  await handle?.close();
  await using(fixture, async tx => {
    for (const database of [...created, name])
      await tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [database]);
  });
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('cell provisioning (I0003)', () => {
  let first, firstSystem;

  it('AC01: one registered cell becomes ready and Napsoft becomes selectable', async () => {
    firstSystem = system();
    first = await register();
    await firstSystem.worker.tick();

    const row = await job(first.cell.id);
    expect(row).toMatchObject({
      stage: 'complete',
      status: 'completed',
      failure_code: null,
      attempts: 0,
    });
    const cell = await db.one('SELECT enabled FROM admin.cells WHERE id=$1', [
      first.cell.id,
    ]);
    expect(cell.enabled).toBe(true);
    expect(firstSystem.registry.readiness(first.cell.id)).toEqual({
      ready: true,
    });
    expect(await napsoft()).toMatchObject({
      cell_id: first.cell.id,
      provisioned: true,
      rbac_ready: true,
    });
    expect(Object.keys(await publishedMap())).toEqual([first.cell.id]);

    const selected = await select(firstSystem.registry);
    expect(selected.session.tenant).toBe(napsoftId);

    const cellDb = await firstSystem.registry.cellFor({ tenant: napsoftId });
    const members = await cellDb.tenant_members.findWhere({
      tenant_id: napsoftId,
    });
    expect(members.map(m => m.portal_user_id)).toEqual([rootUser.id]);
  });

  it('AC02: a restarted API loads the published cell and can still select', async () => {
    const restarted = createCellRegistry({ admin: db });
    const map = await publishedMap();
    await restarted.load(
      Object.fromEntries(
        Object.entries(map).map(([id, endpoint]) => [
          id,
          { endpoint, appPassword: config.appPassword },
        ])
      )
    );
    try {
      expect(restarted.readiness(first.cell.id)).toEqual({ ready: true });
      expect((await select(restarted)).session.tenant).toBe(napsoftId);
    } finally {
      await restarted.close();
    }
  });

  it('AC03: a broken cell reports its reason and leaves others serving', async () => {
    const endpoint = (await publishedMap())[first.cell.id];
    const registry = createCellRegistry({ admin: db });
    const stranger = randomUUID();
    await registry.load({
      [first.cell.id]: { endpoint, appPassword: config.appPassword },
      [stranger]: { endpoint, appPassword: config.appPassword },
    });
    try {
      expect(registry.readiness(first.cell.id)).toEqual({ ready: true });
      expect(registry.readiness(stranger)).toEqual({
        ready: false,
        reason: 'CELL_NOT_REGISTERED',
      });
      const wrongPassword = createCellRegistry({ admin: db });
      await wrongPassword.load({
        [first.cell.id]: { endpoint, appPassword: 'wrong' },
      });
      expect(wrongPassword.readiness(first.cell.id)).toEqual({
        ready: false,
        reason: 'CELL_UNREACHABLE',
      });
      await wrongPassword.close();
    } finally {
      await registry.close();
    }
  });

  it('AC09: disable makes the cell not ready at once; activate restores it without rerunning setup', async () => {
    await disableCell(db, authority(), first.cell.id);
    firstSystem.registry.markDisabled(first.cell.id);
    expect(firstSystem.registry.readiness(first.cell.id)).toEqual({
      ready: false,
      reason: 'CELL_DISABLED',
    });
    await expect(select(firstSystem.registry)).rejects.toThrow(
      'CELL_UNAVAILABLE'
    );

    const queued = await activateCell(db, authority(), first.cell.id);
    expect(queued).toMatchObject({
      requested_action: 'activate',
      stage: 'activation',
      status: 'queued',
    });
    const ran = [];
    const stages = Object.fromEntries(
      Object.entries(firstSystem.stages).map(([key, run]) => [
        key,
        async context => {
          ran.push(key);
          return run(context);
        },
      ])
    );
    await system({ registry: firstSystem.registry, stages }).worker.tick();
    expect(ran).toEqual(['activation']);
    expect(firstSystem.registry.readiness(first.cell.id)).toEqual({
      ready: true,
    });
    expect((await select(firstSystem.registry)).session.tenant).toBe(napsoftId);
    const events = await db.any(
      "SELECT 1 FROM admin.managed_events WHERE event_key='cell.activate.requested' AND target_id=$1",
      [first.cell.id]
    );
    expect(events).toHaveLength(1);
  });

  it('AC04: a job left running is queued again on start and completes', async () => {
    const second = await register();
    await db.none(
      "UPDATE admin.cell_provisioning SET stage='setup', status='running' WHERE cell_id=$1",
      [second.cell.id]
    );
    const { worker } = system();
    await worker.start();
    try {
      await expect
        .poll(async () => (await job(second.cell.id)).status, {
          timeout: 20000,
        })
        .toBe('completed');
    } finally {
      await worker.stop();
    }
  });

  it('AC05: two workers never claim the same job', async () => {
    await register();
    const claims = await Promise.all([
      claimCellProvisioning(db),
      claimCellProvisioning(db),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claimed = claims.find(Boolean);
    await db.none(
      "UPDATE admin.cell_provisioning SET status='failed', failure_code='SETUP_FAILED' WHERE id=$1",
      [claimed.id]
    );
  });

  it('AC06: a failed step leaves the cell disabled; retry completes it reusing the database', async () => {
    const third = await register();
    const base = system();
    let fail = true;
    const stages = {
      ...base.stages,
      migration: async context => {
        if (fail) {
          fail = false;
          throw Object.assign(new Error('x'), { code: 'MIGRATION_FAILED' });
        }
        return base.stages.migration(context);
      },
    };
    const { worker } = system({ registry: base.registry, stages });
    await worker.tick();
    expect(await job(third.cell.id)).toMatchObject({
      stage: 'migration',
      status: 'failed',
      failure_code: 'MIGRATION_FAILED',
    });
    const cell = await db.one('SELECT enabled FROM admin.cells WHERE id=$1', [
      third.cell.id,
    ]);
    expect(cell.enabled).toBe(false);
    const oid = await db.one('SELECT oid FROM pg_database WHERE datname=$1', [
      third.cell.database_name,
    ]);

    await retryCellProvisioning(db, authority(), third.cell.id);
    await worker.tick();
    expect(await job(third.cell.id)).toMatchObject({
      status: 'completed',
      attempts: 1,
    });
    expect(
      await db.one('SELECT oid FROM pg_database WHERE datname=$1', [
        third.cell.database_name,
      ])
    ).toEqual(oid);
    await base.registry.close();
  });

  it('AC07: an unowned database, or an unknown create outcome, fails without creating anything', async () => {
    const fourth = await register();
    await using(
      roleUrl(config.maintenance, 'nap-admin', config.adminPassword),
      tx => tx.none('CREATE DATABASE $1:name', [fourth.cell.database_name])
    );
    const { worker, registry } = system();
    await worker.tick();
    expect(await job(fourth.cell.id)).toMatchObject({
      stage: 'setup',
      status: 'failed',
      failure_code: 'TARGET_NOT_OWNED',
    });

    // A recorded create request for this operation turns the same finding
    // into an unknown outcome instead.
    const state = JSON.parse(await readFile(provisioning.stateFile, 'utf8'));
    state.cells[fourth.cell.id] = {
      operationId: fourth.operation.operation_id,
      createRequested: true,
    };
    await writeFile(provisioning.stateFile, JSON.stringify(state), {
      mode: 0o600,
    });
    await retryCellProvisioning(db, authority(), fourth.cell.id);
    await worker.tick();
    expect(await job(fourth.cell.id)).toMatchObject({
      status: 'failed',
      failure_code: 'CREATE_OUTCOME_UNKNOWN',
    });
    const marker = await db.one(
      "SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1",
      [fourth.cell.database_name]
    );
    expect(marker.marker).not.toBe(
      operationMarker(fourth.operation.operation_id)
    );
    await registry.close();
  });

  it('AC10: a later cell never changes the Napsoft cell; a failed root setup is retried', async () => {
    const before = await napsoft();
    const fifth = await register();
    const { worker, registry } = system();
    await worker.tick();
    expect((await job(fifth.cell.id)).status).toBe('completed');
    expect((await napsoft()).cell_id).toBe(before.cell_id);

    // Reopen root setup and make it fail once.
    await db.none(
      'UPDATE admin.tenants SET provisioned=false, rbac_ready=false WHERE id=$1',
      [napsoftId]
    );
    const driver = createLocalCellDriver(provisioning);
    let broken = true;
    const flaky = {
      ...driver,
      connection: async context => {
        if (broken) throw new Error('unreachable');
        return driver.connection(context);
      },
    };
    const retrying = system({ driver: flaky, registry });
    await retrying.worker.tick();
    expect((await napsoft()).provisioned).toBe(false);
    expect((await job(before.cell_id)).failure_code).toBe('ROOT_SETUP_FAILED');

    broken = false;
    await retrying.worker.tick();
    expect(await napsoft()).toMatchObject({
      provisioned: true,
      rbac_ready: true,
    });
    expect((await job(before.cell_id)).failure_code).toBeNull();
    await registry.close();
    await firstSystem.registry.close();
  });

  it('AC12: no failure code, event, or published secret leaks into admin', async () => {
    const rows = await db.any(
      'SELECT failure_code FROM admin.cell_provisioning WHERE failure_code IS NOT NULL'
    );
    const events = await db.any(
      "SELECT details::text AS details FROM admin.managed_events WHERE target_type='cell'"
    );
    const text = JSON.stringify([rows, events]);
    for (const secret of [
      config.adminPassword,
      config.appPassword,
      url.host,
      'postgresql://',
    ])
      expect(text).not.toContain(secret);
  });
});
