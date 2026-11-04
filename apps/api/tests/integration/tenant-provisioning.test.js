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
import { membershipIn } from './helpers/tenantRows.js';

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

/** A new tenant request with a unique code (I0013-R001). */
function newTenant() {
  const code =
    'C' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  return {
    legalName: `Customer ${code} LLC`,
    dbaName: `Customer ${code}`,
    code,
    phone: '(512) 555-0100',
    address: {
      line1: '1 Main St',
      city: 'Austin',
      region: 'TX',
      postalCode: '78701',
      country: 'US',
    },
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
      legalName: tenant.legalName,
      dbaName: tenant.dbaName,
      code: tenant.code,
      tier: 'starter',
      cell,
      admin: { email, password, phone: tenant.phone, ...name },
      address: tenant.address,
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
    { membership: await membershipIn(db, portalUserId, tenant) },
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
    // nap-admin owns the app tables, so row-level security does not apply
    // to it; every query names the tenant.
    return await cell.db.tx(async tx => {
      return {
        roles: await tx.any(
          `SELECT r.code, r.is_immutable, g.pattern FROM app.roles r
             JOIN app.role_grants g ON g.role_id=r.id
            WHERE r.tenant_id=$1 ORDER BY r.code`,
          [tenantId]
        ),
        assignments: await tx.any(
          `SELECT m.portal_user_id, r.code FROM app.role_assignments a
             JOIN app.roles r ON r.id=a.role_id
             JOIN cell.tenant_members m ON m.id=a.membership_id
            WHERE a.tenant_id=$1`,
          [tenantId]
        ),
        // M0005-R022: the first administrator's directory rows.
        people: await tx.any(
          `SELECT x.party_id, p.kind, x.first_name, x.last_name, x.is_portal_user
             FROM app.people x JOIN app.parties p ON p.id=x.party_id
            WHERE x.tenant_id=$1`,
          [tenantId]
        ),
        emails: await tx.any(
          `SELECT party_id, value FROM app.contact_methods
            WHERE tenant_id=$1 AND type='email' AND is_primary
              AND deactivated_at IS NULL`,
          [tenantId]
        ),
        phones: await tx.any(
          `SELECT m.party_id, m.value, l.name AS label FROM app.contact_methods m
             LEFT JOIN app.contact_labels l ON l.id=m.label_id
            WHERE m.tenant_id=$1 AND m.type='phone' AND m.is_primary
              AND m.deactivated_at IS NULL`,
          [tenantId]
        ),
        designations: await tx.any(
          `SELECT person_id, role FROM app.contact_roles
            WHERE tenant_id=$1 AND role IS NOT NULL
              AND deactivated_at IS NULL
            ORDER BY role`,
          [tenantId]
        ),
        labels: await tx.one(
          'SELECT count(*)::int AS n FROM app.contact_labels WHERE tenant_id=$1',
          [tenantId]
        ),
        formats: await tx.one(
          'SELECT count(*)::int AS n FROM app.tax_id_formats WHERE tenant_id=$1',
          [tenantId]
        ),
        settings: await tx.one(
          'SELECT count(*)::int AS n FROM app.tenant_settings WHERE tenant_id=$1',
          [tenantId]
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

  it('AC03, AC07: creates the tenant and its client ID and queues the job; the admin cannot select yet; the key replays', async () => {
    const request = newTenant();
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
      stage: 'client',
      status: 'queued',
    });
    expect(
      await db.tenants.findOneBy(
        { id: tenant.id },
        {
          columnWhitelist: [
            'tenant_code',
            'name',
            'legal_name',
            'dba_name',
            'status',
            'cell_id',
          ],
        }
      )
    ).toEqual({
      tenant_code: request.code,
      name: request.dbaName,
      legal_name: request.legalName,
      dba_name: request.dbaName,
      status: 'pending',
      cell_id: null,
    });
    tenant.clientId = (await db.tenants.findOneBy({ id: tenant.id })).client_id;
    expect(tenant.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect((await job(tenant.id)).admin_phone).toBe('+15125550100');
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
      provision({ ...tenant, legalName: 'Other LLC' }, cellId, email, key)
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await expect(
      provision({ ...tenant, phone: '(512) 555-0199' }, cellId, email, key)
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

    const {
      roles,
      assignments,
      people,
      emails,
      phones,
      designations,
      labels,
      formats,
      settings,
    } = await cellRoles(cellId, tenant.id);
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
    // I0014-R006: the administrator holds every system contact role.
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
    expect(designations).toEqual(
      ['billing', 'notifications', 'primary'].map(role => ({
        person_id: membership.member_id,
        role,
      }))
    );
    expect(phones).toEqual([
      {
        party_id: membership.member_id,
        value: '+15125550100',
        label: null,
      },
    ]);
    expect(labels.n).toBe(14);
    // I0013-R015: the administrator's contact copy is queued for Napsoft.
    expect(
      await inNapsoftCell(tx =>
        tx.one(
          "SELECT payload FROM cell.outbox WHERE topic='tenant_contact' AND entity_id=$1",
          [membership.member_id]
        )
      )
    ).toEqual({
      payload: {
        tenant_id: tenant.id,
        party_id: membership.member_id,
        first_name: 'Jane',
        last_name: 'Doe',
        email,
        phone: '+15125550100',
        roles: ['primary', 'billing', 'notifications'],
      },
    });
    // I0013-R003: the client stage created the Napsoft client.
    expect(
      await inNapsoftCell(tx =>
        tx.one(
          `SELECT p.kind, o.legal_name, o.dba_name FROM app.parties p
             JOIN app.organizations o ON o.party_id=p.id
            WHERE p.id=$1 AND p.tenant_id=$2`,
          [tenant.clientId, napsoftId]
        )
      )
    ).toEqual({
      kind: 'client',
      legal_name: tenant.legalName,
      dba_name: tenant.dbaName,
    });
    // I0014-R024: its head office is its default location and bill-to.
    expect(
      await inNapsoftCell(tx =>
        tx.any(
          `SELECT a.line1, a.city, a.is_primary, ap.purpose, ap.is_default,
                  ap.delivery_method
             FROM app.addresses a
             JOIN app.address_purposes ap ON ap.address_id=a.id
            WHERE a.party_id=$1 ORDER BY ap.purpose`,
          [tenant.clientId]
        )
      )
    ).toEqual([
      {
        line1: '1 Main St',
        city: 'Austin',
        is_primary: true,
        purpose: 'bill_to',
        is_default: true,
        delivery_method: 'email',
      },
      {
        line1: '1 Main St',
        city: 'Austin',
        is_primary: true,
        purpose: 'location',
        is_default: true,
        delivery_method: null,
      },
    ]);
    expect(formats.n).toBe(3);
    expect(settings.n).toBe(1);
  });

  it('AC06: rejects a code already used, a cell that is not ready, and an invalid phone', async () => {
    const before = await db.portal_users.countAll({ includeDeactivated: true });
    const tenantsBefore = await db.tenants.countAll({
      includeDeactivated: true,
    });
    const fresh = newTenant();
    // I0006-R023: a conflict names the value that is taken.
    await expect(
      provision({ ...fresh, code: tenant.code }, cellId, 'y@nap.test')
    ).rejects.toMatchObject({ code: 'CONFLICT', details: { field: 'code' } });
    await expect(
      provision(fresh, randomUUID(), 'z@nap.test')
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });
    await expect(
      provision({ ...fresh, phone: 'not a phone' }, cellId, 'p@nap.test')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await db.tenants.countAll({ includeDeactivated: true })).toBe(
      tenantsBefore
    );
    expect(await db.portal_users.countAll({ includeDeactivated: true })).toBe(
      before
    );
  });

  it('AC13: refuses an administrator email whose login is not active, naming the email (I0006-R023)', async () => {
    const blocked = `blocked-${randomUUID()}@nap.test`;
    await db.portal_users.insert({
      email: blocked,
      password_hash: 'not-a-real-hash',
      status: 'disabled',
    });
    await expect(provision(newTenant(), cellId, blocked)).rejects.toMatchObject(
      { code: 'CONFLICT', details: { field: 'email' } }
    );
  });

  it('AC04, AC08: a failed stage keeps the tenant pending; retry completes without duplicates and reuses the login', async () => {
    const second = {
      id: (await provision(newTenant(), cellId, email)).tenantId,
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

  it('I0013 AC02: a failed client stage keeps the job at that stage; retry creates one client', async () => {
    const fourth = {
      id: (
        await provision(
          newTenant(),
          cellId,
          `fourth-${randomUUID().slice(0, 8)}@acme.test`
        )
      ).tenantId,
    };
    const real = createTenantStages({ admin: { db }, driver, registry });
    let failClient = true;
    const flaky = {
      ...real,
      client: async row => {
        await real.client(row);
        if (failClient) {
          failClient = false;
          throw Object.assign(new Error('down'), { code: 'CELL_UNAVAILABLE' });
        }
      },
    };
    await worker({ tenantStages: flaky }).tick();
    expect(await job(fourth.id)).toMatchObject({
      stage: 'client',
      status: 'failed',
      failure_code: 'CELL_UNAVAILABLE',
    });
    await executeProvisionCommand(db, authority(), {
      operation: 'tenant-retry',
      tenant: fourth.id,
    });
    await worker({ tenantStages: flaky }).tick();
    expect(await job(fourth.id)).toMatchObject({ status: 'completed' });
    const { client_id: clientId } = await db.tenants.findOneBy({
      id: fourth.id,
    });
    expect(
      await inNapsoftCell(tx =>
        tx.one(
          'SELECT count(*)::int AS n FROM app.organizations WHERE party_id=$1',
          [clientId]
        )
      )
    ).toEqual({ n: 1 });
  });

  it('AC05: a job left running is requeued on start and completes', async () => {
    const third = {
      id: (
        await provision(
          newTenant(),
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
