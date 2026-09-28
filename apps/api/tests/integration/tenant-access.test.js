/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import {
  listEligibleTenants,
  selectTenant,
} from '../../src/modules/admin-tenancy/domain/tenantAccess.js';

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
const policy = {
  secret: 'integration-tenant-access-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
let handle, db;

/**
 * Insert an active portal user.
 * @returns {Promise<string>} The portal-user UUID.
 */
async function portalUser() {
  const row = await db.portal_users.insert({
    email: `user-${randomUUID()}@nap.test`,
    password_hash: 'argon2id$placeholder',
    status: 'active',
  });
  return row.id;
}

/**
 * Insert a tenant eligible for selection:
 * active, provisioned, and RBAC-ready.
 * @param {object} [overrides]
 * @returns {Promise<string>} The tenant UUID.
 */
async function eligibleTenant({
  status = 'active',
  provisioned = true,
  rbacReady = true,
} = {}) {
  const row = await db.tenants.insert({
    tenant_code: 'T-' + randomUUID().slice(0, 8),
    name: 'Tenant',
    status,
    provisioned,
    rbac_ready: rbacReady,
  });
  return row.id;
}

/**
 * Insert an active, ready membership linking a portal user to a tenant.
 * @param {string} portalUserId
 * @param {string} tenantId
 * @returns {Promise<void>}
 */
async function readyMembership(portalUserId, tenantId) {
  await db.portal_user_tenants.insert({
    portal_user_id: portalUserId,
    tenant_id: tenantId,
    member_type: 'employee',
    status: 'active',
    ready: true,
    member_id: randomUUID(),
  });
}

/**
 * Insert an enabled cell and assign it to a tenant.
 * @param {string} tenantId
 * @returns {Promise<string>} The cell UUID.
 */
async function assignedEnabledCell(tenantId) {
  const cell = await db.cells.insert({
    environment: 'test',
    database_name: 'nap_test_cell_' + randomUUID().slice(0, 8),
    enabled: true,
  });
  await db.tenants.update(tenantId, { cell_id: cell.id });
  return cell.id;
}

const readyRuntime = { readiness: () => ({ ready: true }) };

/**
 * Read the stored session row, archived or not.
 * @param {string} id
 * @returns {Promise<object>}
 */
function stored(id) {
  return db.sessions.findOneBy({ id }, { includeDeactivated: true });
}

/**
 * Read the events recorded for a session, oldest first.
 * @param {string} id
 * @returns {Promise<object[]>}
 */
function eventsFor(id) {
  return db.managed_events.findWhere({ session_id: id }, 'AND', {
    columnWhitelist: [
      'event_key',
      'outcome',
      'actor_id',
      'tenant_id',
      'details',
    ],
    orderBy: ['occurred_at', 'id'],
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

describe('listEligibleTenants', () => {
  it("lists the caller's own active, ready memberships in eligible tenants", async () => {
    const user = await portalUser();
    const eligible = await eligibleTenant();
    const notReady = await eligibleTenant();
    await readyMembership(user, eligible);
    await db.portal_user_tenants.insert({
      portal_user_id: user,
      tenant_id: notReady,
      member_type: 'employee',
      status: 'pending',
      ready: false,
    });
    const rows = await listEligibleTenants(db, user);
    expect(rows.map(row => row.id)).toEqual([eligible]);
  });
});

describe('selectTenant', () => {
  it('rotates the token and sets the tenant when everything is eligible', async () => {
    const user = await portalUser();
    const tenant = await eligibleTenant();
    await readyMembership(user, tenant);
    await assignedEnabledCell(tenant);
    const created = await createSession(db, policy, { portalUserId: user });

    const result = await selectTenant(
      db,
      policy,
      created.token,
      { user },
      { tenant },
      { runtime: readyRuntime }
    );
    expect(result.token).not.toBe(created.token);
    expect(result.session.tenant).toBe(tenant);

    const row = await stored(created.session.id);
    expect(row.tenant_id).toBe(tenant);
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'tenant.selected',
        outcome: 'succeeded',
        tenant_id: tenant,
      })
    );
  });

  it('refuses an ineligible membership, an ineligible tenant, and an unavailable cell', async () => {
    const user = await portalUser();
    const notMyTenant = await eligibleTenant();
    const suspended = await eligibleTenant({ status: 'suspended' });
    const noCell = await eligibleTenant();
    await readyMembership(user, suspended);
    await readyMembership(user, noCell);
    const created = await createSession(db, policy, { portalUserId: user });

    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user },
        { tenant: notMyTenant },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user },
        { tenant: suspended },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user },
        { tenant: noCell },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });

    expect((await stored(created.session.id)).tenant_id).toBeNull();
  });

  it('reports the cell unavailable without a runtime collaborator, even when the cell is enabled', async () => {
    const user = await portalUser();
    const tenant = await eligibleTenant();
    await readyMembership(user, tenant);
    await assignedEnabledCell(tenant);
    const created = await createSession(db, policy, { portalUserId: user });
    await expect(
      selectTenant(db, policy, created.token, { user }, { tenant })
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });
  });

  it('produces exactly one winner for concurrent selections of the same token', async () => {
    const user = await portalUser();
    const tenant = await eligibleTenant();
    await readyMembership(user, tenant);
    await assignedEnabledCell(tenant);
    const created = await createSession(db, policy, { portalUserId: user });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        selectTenant(
          db,
          policy,
          created.token,
          { user },
          { tenant },
          { runtime: readyRuntime }
        )
      )
    );
    const winners = attempts.filter(result => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    for (const loser of attempts.filter(r => r.status === 'rejected'))
      expect(['UNAUTHENTICATED', 'CONFLICT']).toContain(loser.reason.code);
  });
});
