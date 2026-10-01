/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import {
  executeProvisionCommand,
  registerCell,
} from '../../src/modules/admin-tenancy/domain/cells.js';
import { bootstrapNapsoft } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { selectTenant } from '../../src/modules/admin-tenancy/domain/tenantAccess.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createTenantStages } from '../../src/application/provisioning/tenantStages.js';
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
let handle, db, dir, provisioning, driver, registry, napsoftId, actor;

const authority = () => ({ actorId: actor, granted: true });
const suffix = () => 't' + randomUUID().replaceAll('-', '').slice(0, 12);

/**
 * Build the worker as `server.js` does, optionally swapping tenant stages.
 * @param {{tenantStages?: object}} [overrides]
 */
function worker(overrides = {}) {
  return createProvisioningWorker({
    admin: { db },
    driver,
    stages: createStages({ driver, registry, environment: 'test' }),
    tenantStages:
      overrides.tenantStages ??
      createTenantStages({ admin: { db }, driver, registry }),
    intervalMs: 5,
  });
}

/**
 * Run `operation` in the Napsoft cell as `nap-admin`, scoped to the Napsoft
 * tenant.
 * @param {(tx: object) => Promise<unknown>} operation
 */
async function inNapsoftCell(operation) {
  const target = await driver.connection({
    cell: await db.cells.findOneBy(
      { id: cellId },
      { columnWhitelist: ['id', 'database_name'] }
    ),
  });
  const cell = createCellDatabase(
    roleUrl(target.endpoint, 'nap-admin', target.adminPassword)
  );
  try {
    await cell.connect();
    return await cell.db.tx(async tx => {
      await tx.one("SELECT set_config('nap.tenant_id', $1, true)", [napsoftId]);
      return operation(tx);
    });
  } finally {
    await cell.close();
  }
}

/**
 * A new organization in the Napsoft tenant's directory (I0006-R001).
 * @param {'client'|'vendor'} [kind]
 * @returns {Promise<string>} Its party ID.
 */
function napsoftOrganization(kind = 'client') {
  return inNapsoftCell(async tx => {
    const { id } = await tx.one(
      'INSERT INTO app.parties (tenant_id, kind) VALUES ($1, $2) RETURNING id',
      [napsoftId, kind]
    );
    await tx.none(
      'INSERT INTO app.organizations (party_id, tenant_id, legal_name) VALUES ($1, $2, $3)',
      [id, napsoftId, `Customer ${id.slice(0, 8)}`]
    );
    return id;
  });
}

/** A new tenant request: a fresh Napsoft client and a unique code. */
async function newTenant() {
  const code =
    'C' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  return {
    client: await napsoftOrganization(),
    code,
    name: `Customer ${code}`,
  };
}

function provision(
  tenant,
  cell,
  email,
  key = randomUUID(),
  password = 'temporary-password',
  name = { firstName: 'Jane', lastName: 'Doe' }
) {
  return executeProvisionCommand(
    db,
    authority(),
    {
      operation: 'tenant-provision',
      client: tenant.client,
      code: tenant.code,
      name: tenant.name,
      tier: 'starter',
      cell,
      admin: { email, password, ...name },
    },
    { idempotencyKey: key, runtime: registry, hashingPolicy: ARGON2_MINIMUM }
  );
}

const job = tenantId =>
  db.tenant_provisioning.findOneBy({ tenant_id: tenantId });
const loginOf = email => db.portal_users.findOneBy({ email });

async function select(portalUserId, tenant) {
  const { token, session } = await createSession(db, sessionPolicy, {
    portalUserId,
  });
  return selectTenant(
    db,
    sessionPolicy,
    token,
    session,
    { tenant },
    { runtime: registry }
  );
}

/** Roles and assignments in a tenant's cell, read as `nap-admin`. */
async function cellRoles(cellId, tenantId) {
  const target = await driver.connection({
    cell: await db.cells.findOneBy(
      { id: cellId },
      { columnWhitelist: ['id', 'database_name'] }
    ),
  });
  const cell = createCellDatabase(
    roleUrl(target.endpoint, 'nap-admin', target.adminPassword)
  );
  try {
    await cell.connect();
    return await cell.db.tx(async tx => {
      await tx.one("SELECT set_config('nap.tenant_id', $1, true)", [tenantId]);
      return {
        roles: await tx.any(
          `SELECT r.code, r.is_immutable, g.pattern FROM app.roles r
             JOIN app.role_grants g ON g.role_id=r.id ORDER BY r.code`
        ),
        assignments: await tx.any(
          `SELECT a.portal_user_id, r.code FROM app.role_assignments a
             JOIN app.roles r ON r.id=a.role_id`
        ),
        // M0005-R022: the first administrator's directory rows.
        people: await tx.any(
          `SELECT x.party_id, p.kind, x.first_name, x.last_name, x.is_portal_user
             FROM app.people x JOIN app.parties p ON p.id=x.party_id`
        ),
        emails: await tx.any(
          `SELECT party_id, value FROM app.contact_methods
            WHERE type='email' AND is_primary AND deactivated_at IS NULL`
        ),
        designations: await tx.any(
          `SELECT party_id, is_primary_contact, is_billing_contact
             FROM app.people
            WHERE (is_primary_contact OR is_billing_contact)
              AND deactivated_at IS NULL`
        ),
        labels: await tx.one(
          'SELECT count(*)::int AS n FROM app.contact_labels'
        ),
      };
    });
  } finally {
    await cell.close();
  }
}

let cellId;

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
  napsoftId = boot.tenant.id;
  actor = boot.login.id;
  dir = await mkdtemp(join(tmpdir(), 'nap-tenants-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'A=1\n', { mode: 0o600 });
  provisioning = {
    adminPassword: config.adminPassword,
    appPassword: config.appPassword,
    setup: config.maintenance,
    stateFile: join(dir, 'state.json'),
    envFile,
  };
  driver = createLocalCellDriver(provisioning);
  registry = createCellRegistry({ admin: db });
  const registered = await registerCell(db, 'test', authority(), {
    operation: 'cell',
    suffix: suffix(),
  });
  created.add(registered.cell.database_name);
  cellId = registered.cell.id;
  await worker().tick();
  expect(registry.readiness(cellId)).toEqual({ ready: true });
  // The first cell becomes the Napsoft tenant's cell, which holds its clients.
  expect(
    (
      await db.tenants.findOneBy(
        { id: napsoftId },
        { columnWhitelist: ['cell_id'] }
      )
    ).cell_id
  ).toBe(cellId);
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

describe('tenant provisioning (I0006)', () => {
  let tenant, email;

  it('AC03, AC07: creates the tenant from a client and queues the job; the admin cannot select yet; the key replays', async () => {
    const request = await newTenant();
    email = `admin-${randomUUID().slice(0, 8)}@acme.test`;
    const key = randomUUID();
    const queued = await provision(
      request,
      cellId,
      ` ${email.toUpperCase()} `,
      key
    );
    tenant = { ...request, id: queued.tenantId };
    expect(queued).toMatchObject({
      cellId,
      stage: 'assignment',
      status: 'queued',
    });
    expect(
      await db.tenants.findOneBy(
        { id: tenant.id },
        {
          columnWhitelist: [
            'tenant_code',
            'name',
            'client_id',
            'status',
            'cell_id',
          ],
        }
      )
    ).toEqual({
      tenant_code: request.code,
      name: request.name,
      client_id: request.client,
      status: 'pending',
      cell_id: null,
    });
    const login = await loginOf(email);
    expect(login.must_change_password).toBe(true);
    await expect(select(login.id, tenant.id)).rejects.toBeTruthy();

    expect(await provision(tenant, cellId, email, key)).toEqual(queued);
    await expect(
      provision({ ...tenant, code: 'OTHER_CODE' }, cellId, email, key)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      provision(tenant, cellId, 'other@acme.test', key)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      provision(tenant, cellId, email, key, 'different-password')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      provision(tenant, cellId, email, key, undefined, {
        firstName: 'Janet',
        lastName: 'Doe',
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('AC01, AC02: the worker provisions the tenant and the admin selects it with tenant_admin', async () => {
    await worker().tick();
    expect(await job(tenant.id)).toMatchObject({
      stage: 'complete',
      status: 'completed',
      failure_code: null,
    });
    expect(
      await db.tenants.findOneBy(
        { id: tenant.id },
        {
          columnWhitelist: ['status', 'cell_id', 'provisioned', 'rbac_ready'],
        }
      )
    ).toEqual({
      status: 'active',
      cell_id: cellId,
      provisioned: true,
      rbac_ready: true,
    });
    const login = await loginOf(email);
    const selected = await select(login.id, tenant.id);
    expect(selected.session.tenant).toBe(tenant.id);
    const membership = await db.portal_user_tenants.findOneBy(
      { portal_user_id: login.id, tenant_id: tenant.id },
      { columnWhitelist: ['member_type', 'member_id'] }
    );
    expect(membership.member_type).toBe('employee');
    expect(membership.member_id).toMatch(/^[0-9a-f-]{36}$/);

    const { roles, assignments, people, emails, designations, labels } =
      await cellRoles(cellId, tenant.id);
    expect(roles).toEqual([
      {
        code: 'tenant_admin',
        is_immutable: true,
        pattern: `${tenant.code}::*::*::*`,
      },
    ]);
    expect(assignments).toEqual([
      { portal_user_id: login.id, code: 'tenant_admin' },
    ]);
    // M0005 AC07: the administrator is an employee; no one is flagged as a
    // tenant contact.
    expect(people).toEqual([
      {
        party_id: membership.member_id,
        kind: 'employee',
        first_name: 'Jane',
        last_name: 'Doe',
        is_portal_user: true,
      },
    ]);
    expect(emails).toEqual([{ party_id: membership.member_id, value: email }]);
    expect(designations).toEqual([]);
    expect(labels.n).toBe(13);
  });

  it('AC06: rejects an unknown client, a non-client, a client or code already used, and a cell that is not ready', async () => {
    const before = await db.portal_users.countAll({ includeDeactivated: true });
    const tenantsBefore = await db.tenants.countAll({
      includeDeactivated: true,
    });
    const fresh = await newTenant();
    await expect(
      provision({ ...fresh, client: randomUUID() }, cellId, 'w@nap.test')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      provision(
        { ...fresh, client: await napsoftOrganization('vendor') },
        cellId,
        'x@nap.test'
      )
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      provision({ ...fresh, client: tenant.client }, cellId, 'y@nap.test')
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      provision({ ...fresh, code: tenant.code }, cellId, 'y@nap.test')
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      provision(fresh, randomUUID(), 'z@nap.test')
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });
    expect(await db.tenants.countAll({ includeDeactivated: true })).toBe(
      tenantsBefore
    );
    expect(await db.portal_users.countAll({ includeDeactivated: true })).toBe(
      before
    );
  });

  it('AC04, AC08: a failed stage keeps the tenant pending; retry completes without duplicates and reuses the login', async () => {
    const second = {
      id: (await provision(await newTenant(), cellId, email)).tenantId,
    };
    const real = createTenantStages({ admin: { db }, driver, registry });
    let failSeed = true;
    const flaky = {
      ...real,
      seed: async row => {
        await real.seed(row);
        if (failSeed) {
          failSeed = false;
          throw Object.assign(new Error('boom'), { code: 'SEED_FAILED' });
        }
      },
    };
    await worker({ tenantStages: flaky }).tick();
    expect(await job(second.id)).toMatchObject({
      stage: 'seed',
      status: 'failed',
      failure_code: 'SEED_FAILED',
    });
    expect((await db.tenants.findOneBy({ id: second.id })).status).toBe(
      'pending'
    );

    await executeProvisionCommand(db, authority(), {
      operation: 'tenant-retry',
      tenant: second.id,
    });
    await worker({ tenantStages: flaky }).tick();
    expect(await job(second.id)).toMatchObject({
      stage: 'complete',
      status: 'completed',
      attempts: 1,
    });
    const login = await loginOf(email);
    const { roles, assignments } = await cellRoles(cellId, second.id);
    expect(roles).toHaveLength(1);
    expect(assignments).toEqual([
      { portal_user_id: login.id, code: 'tenant_admin' },
    ]);
    const memberships = await db.portal_user_tenants.findWhere({
      portal_user_id: login.id,
    });
    expect(memberships.map(m => m.tenant_id).sort()).toEqual(
      [tenant.id, second.id].sort()
    );
  });

  it('AC05: a job left running is requeued on start and completes', async () => {
    const third = {
      id: (
        await provision(
          await newTenant(),
          cellId,
          `third-${randomUUID().slice(0, 8)}@acme.test`
        )
      ).tenantId,
    };
    const row = await job(third.id);
    await db.tenant_provisioning.update(row.id, { status: 'running' });
    const running = worker();
    await running.start();
    for (let i = 0; i < 400; i += 1) {
      if ((await job(third.id)).status === 'completed') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await running.stop();
    expect(await job(third.id)).toMatchObject({ status: 'completed' });
  });
});
