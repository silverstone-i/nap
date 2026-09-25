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
import {
  ROTATED_TOKEN,
  createSession,
  resolveSession,
  rotateSession,
} from '../../src/modules/admin-tenancy/domain/session.js';
import {
  enterSupport,
  exitSupport,
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
 * Insert a tenant eligible for both normal selection and support entry:
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
      'effective_user_id',
      'tenant_id',
      'details',
    ],
    orderBy: ['occurred_at', 'id'],
  });
}

/**
 * A resolved-authorization-shaped context granting every platform
 * capability, the same shape `resolveAuthorization` returns for root.
 * @param {string} actorId
 * @returns {{actorId: string, platform: 'root', platformCapabilities: string[]}}
 */
function grantedContext(actorId) {
  return {
    actorId,
    platform: 'root',
    platformCapabilities: ['admin-tenancy::access::support'],
  };
}

/** A resolved-authorization-shaped context granting no capability. */
function deniedContext(actorId) {
  return { actorId, platform: null, platformCapabilities: [] };
}

/**
 * A minimal session view shaped like what `middleware/sessionContext.js`
 * would attach to `request.session`.
 * @param {object} row Stored session row.
 * @returns {object}
 */
function sessionView(row) {
  return {
    id: row.id,
    user: row.portal_user_id,
    tenant: row.tenant_id,
    accessMode: row.access_mode,
    effectiveUser: row.effective_user_id,
    accessReason: row.access_reason,
    accessExpiresAt: row.access_expires_at,
  };
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
      { user, accessMode: 'normal' },
      { tenant },
      { runtime: readyRuntime }
    );
    expect(result.token).not.toBe(created.token);
    expect(result.session.tenant).toBe(tenant);
    expect(result.session.accessMode).toBe('normal');

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
        { user, accessMode: 'normal' },
        { tenant: notMyTenant },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user, accessMode: 'normal' },
        { tenant: suspended },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user, accessMode: 'normal' },
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
      selectTenant(
        db,
        policy,
        created.token,
        { user, accessMode: 'normal' },
        { tenant }
      )
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });
  });

  it('refuses selection while already in a support session, exit first', async () => {
    const user = await portalUser();
    const tenant = await eligibleTenant();
    await readyMembership(user, tenant);
    await assignedEnabledCell(tenant);
    const created = await createSession(db, policy, { portalUserId: user });
    await db.sessions.update(created.session.id, {
      tenant_id: tenant,
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() + 30 * 60_000),
    });
    await expect(
      selectTenant(
        db,
        policy,
        created.token,
        { user, accessMode: 'support' },
        { tenant },
        { runtime: readyRuntime }
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });
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
          { user, accessMode: 'normal' },
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

describe('enterSupport and exitSupport', () => {
  it('enters a time-limited support context and exits it, round-tripping through real constraints', async () => {
    const operator = await portalUser();
    const target = await eligibleTenant();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });

    const entered = await enterSupport(
      db,
      policy,
      created.token,
      { user: operator, id: created.session.id, accessMode: 'normal' },
      grantedContext(operator),
      { tenant: target, reason: 'investigating a billing defect' }
    );
    expect(entered.session.accessMode).toBe('support');
    expect(entered.session.tenant).toBe(target);

    const row = await stored(created.session.id);
    expect(row.access_mode).toBe('support');
    expect(row.access_reason).toBe('investigating a billing defect');
    expect(row.access_expires_at.getTime()).toBeLessThanOrEqual(
      Date.now() + 60 * 60_000 + 1000
    );
    expect(row.access_expires_at.getTime()).toBeLessThanOrEqual(
      row.absolute_expires_at.getTime()
    );
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'support.entered',
        outcome: 'succeeded',
        actor_id: operator,
        tenant_id: target,
      })
    );

    const exited = await exitSupport(
      db,
      policy,
      entered.token,
      sessionView(row)
    );
    expect(exited.session.accessMode).toBe('normal');
    expect(exited.session.tenant).toBeNull();
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'support.exited',
        outcome: 'succeeded',
        tenant_id: target,
      })
    );
  });

  it('denies a caller with no support capability, recording the denial', async () => {
    const operator = await portalUser();
    const target = await eligibleTenant();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    await expect(
      enterSupport(
        db,
        policy,
        created.token,
        { user: operator, id: created.session.id, accessMode: 'normal' },
        deniedContext(operator),
        { tenant: target, reason: 'investigating a billing defect' }
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'support.denied',
        outcome: 'denied',
        details: { code: 'capability' },
      })
    );
    expect((await stored(created.session.id)).access_mode).toBe('normal');
  });

  it('refuses exit from a session that is not in support mode', async () => {
    const operator = await portalUser();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    await expect(
      exitSupport(db, policy, created.token, {
        user: operator,
        id: created.session.id,
        accessMode: 'normal',
        tenant: null,
        effectiveUser: null,
      })
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('automatic access-expiry downgrade', () => {
  it('downgrades an expired support session and rotates its token on the next read', async () => {
    const operator = await portalUser();
    const target = await eligibleTenant();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    await db.sessions.update(created.session.id, {
      tenant_id: target,
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() - 60_000),
    });

    const resolved = await resolveSession(db, policy, created.token);
    expect(resolved.accessMode).toBe('normal');
    expect(resolved.tenant).toBeNull();
    const newToken = resolved[ROTATED_TOKEN];
    expect(newToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    expect((await resolveSession(db, policy, newToken)).id).toBe(
      created.session.id
    );
    await expect(
      resolveSession(db, policy, created.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({
        event_key: 'support.exited',
        outcome: 'succeeded',
        actor_id: operator,
        tenant_id: target,
      })
    );
  });

  it('lets a concurrent request lose the downgrade race without erroring', async () => {
    const operator = await portalUser();
    const target = await eligibleTenant();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    await db.sessions.update(created.session.id, {
      tenant_id: target,
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() - 60_000),
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => resolveSession(db, policy, created.token))
    );
    expect(attempts.every(result => result.status === 'fulfilled')).toBe(true);
    const rotated = attempts.filter(
      result => result.value[ROTATED_TOKEN] !== undefined
    );
    expect(rotated).toHaveLength(1);
    for (const result of attempts) {
      expect(result.value.accessMode).toBe('normal');
      expect(result.value.tenant).toBeNull();
    }
    const exits = (await eventsFor(created.session.id)).filter(
      event => event.event_key === 'support.exited'
    );
    expect(exits).toHaveLength(1);
  });

  it("never rotates a normal session's token on an ordinary read", async () => {
    const operator = await portalUser();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    const resolved = await resolveSession(db, policy, created.token);
    expect(resolved[ROTATED_TOKEN]).toBeUndefined();
    expect((await resolveSession(db, policy, created.token)).id).toBe(
      created.session.id
    );
  });

  it("does not disturb an unrelated explicit rotation's own token", async () => {
    const operator = await portalUser();
    const created = await createSession(db, policy, {
      portalUserId: operator,
    });
    const rotated = await rotateSession(db, policy, created.token);
    expect(rotated.token).not.toBe(created.token);
    expect((await resolveSession(db, policy, rotated.token)).id).toBe(
      created.session.id
    );
  });
});
