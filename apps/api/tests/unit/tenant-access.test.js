/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { createApp } from '../../src/app.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';
import * as authorizationModule from '../../src/modules/admin-tenancy/domain/authorization.js';
import {
  eligibleTenantView,
  selectTenant,
} from '../../src/modules/admin-tenancy/domain/tenantAccess.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };
const ROOT_ID = randomUUID();

describe('validation', () => {
  it('maps a tenant row to the narrow eligible-tenant contract', () => {
    expect(
      eligibleTenantView({
        id: 'tenant-id',
        tenant_code: 'ACME',
        name: 'Acme Construction',
        tier: 'starter',
        cell_id: 'should-not-appear',
      })
    ).toEqual({
      id: 'tenant-id',
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
    });
  });
});

/**
 * Whether a stored row matches an equality/`$in` filter, mirroring enough of
 * pg-schemata's `findOneBy`/`findWhere` semantics for these tests.
 * @param {object} row
 * @param {object} filter
 * @returns {boolean}
 */
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === 'object' && '$in' in value)
      return value.$in.includes(row[key]);
    return row[key] === value;
  });
}

/**
 * Build a session row shaped like the model's joined projection.
 * @param {object} [overrides]
 * @returns {object}
 */
function sessionRow(overrides = {}) {
  const created = new Date();
  return {
    id: randomUUID(),
    portal_user_id: randomUUID(),
    tenant_id: null,
    access_mode: 'normal',
    effective_user_id: null,
    access_reason: null,
    access_expires_at: null,
    last_seen_at: created,
    idle_expires_at: new Date(created.getTime() + 30 * 60_000),
    absolute_expires_at: new Date(created.getTime() + 12 * 3_600_000),
    created_at: created,
    updated_at: created,
    deactivated_at: null,
    user_status: 'active',
    must_change_password: false,
    user_archived: false,
    expired: false,
    stale: false,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle covering every table `tenantAccess.js`
 * and its `domain/session.js` primitives touch. Concurrency and real-lock
 * behavior are verified against real PostgreSQL in the integration test.
 * @param {{tenants?: object[], memberships?: object[], cells?: object[], users?: object[]}} [seed]
 * @returns {{db: object, sessionStore: Map, events: object[], revisions: object[]}}
 */
function fakeAdmin({
  tenants = [],
  memberships = [],
  cells = [],
  users = [],
} = {}) {
  const sessionStore = new Map();
  const tenantStore = new Map(tenants.map(row => [row.id, { ...row }]));
  const cellStore = new Map(cells.map(row => [row.id, { ...row }]));
  const userStore = new Map(
    [...users, { id: ROOT_ID, email: 'root@example.com', is_root: true }].map(
      row => [row.id, { status: 'active', deactivated_at: null, ...row }]
    )
  );
  const membershipStore = memberships.map(row => ({ ...row }));
  const events = [];
  const revisions = [];

  function rotateStored(currentHash, nextHash, patch, precondition) {
    const found = sessionStore.get(currentHash);
    if (!found || found.deactivated_at || !precondition(found)) return null;
    sessionStore.delete(currentHash);
    Object.assign(found, patch, { token_hash: nextHash });
    sessionStore.set(nextHash, found);
    return { ...found };
  }

  const db = {
    tx: operation => operation({}),
    portal_users: {
      findOneBy: async filter => {
        const found = [...userStore.values()].find(
          row => !row.deactivated_at && matches(row, filter)
        );
        return found ? { ...found } : null;
      },
    },
    portal_user_tenants: {
      findOneBy: async filter =>
        membershipStore.find(
          row => !row.deactivated_at && matches(row, filter)
        ) ?? null,
      findWhere: async filter =>
        membershipStore
          .filter(row => !row.deactivated_at && matches(row, filter))
          .map(row => ({ ...row })),
    },
    tenants: {
      findOneBy: async filter => {
        const found = [...tenantStore.values()].find(
          row => !row.deactivated_at && matches(row, filter)
        );
        return found ? { ...found } : null;
      },
      findWhere: async filter =>
        [...tenantStore.values()]
          .filter(row => !row.deactivated_at && matches(row, filter))
          .map(row => ({ ...row })),
    },
    cells: {
      findOneBy: async filter => {
        const found = [...cellStore.values()].find(
          row => !row.deactivated_at && matches(row, filter)
        );
        return found ? { ...found } : null;
      },
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = sessionStore.get(hash);
        if (!found || found.deactivated_at) return null;
        return {
          ...found,
          access_expired:
            found.access_mode === 'support' &&
            found.access_expires_at !== null &&
            found.access_expires_at.getTime() <= Date.now(),
        };
      },
      findOneBy: async ({ id }) => {
        const found = [...sessionStore.values()].find(row => row.id === id);
        return found && !found.deactivated_at ? { ...found } : null;
      },
      touch: async () => null,
      selectTenant: async (currentHash, nextHash, tenantId) =>
        rotateStored(
          currentHash,
          nextHash,
          {
            tenant_id: tenantId,
            access_mode: 'normal',
            effective_user_id: null,
            access_reason: null,
            access_expires_at: null,
          },
          found => found.access_mode === 'normal'
        ),
      enterSupport: async (
        currentHash,
        nextHash,
        { tenantId, effectiveUserId, reason }
      ) =>
        rotateStored(
          currentHash,
          nextHash,
          {
            tenant_id: tenantId,
            access_mode: 'support',
            effective_user_id: effectiveUserId,
            access_reason: reason,
            access_expires_at: new Date(Date.now() + 60 * 60_000),
          },
          found => found.access_mode === 'normal'
        ),
      exitSupport: async (currentHash, nextHash) =>
        rotateStored(
          currentHash,
          nextHash,
          {
            tenant_id: null,
            access_mode: 'normal',
            effective_user_id: null,
            access_reason: null,
            access_expires_at: null,
          },
          found => found.access_mode === 'support'
        ),
      downgradeExpiredAccess: async (id, nextHash) => {
        const found = [...sessionStore.values()].find(row => row.id === id);
        if (
          !found ||
          found.deactivated_at ||
          found.access_mode !== 'support' ||
          !found.access_expires_at ||
          found.access_expires_at.getTime() > Date.now()
        )
          return null;
        sessionStore.delete(found.token_hash);
        Object.assign(found, {
          token_hash: nextHash,
          tenant_id: null,
          access_mode: 'normal',
          effective_user_id: null,
          access_reason: null,
          access_expires_at: null,
        });
        sessionStore.set(nextHash, found);
        return { ...found };
      },
    },
    managed_events: {
      append: async event => {
        const row = { id: randomUUID(), occurred_at: new Date(), ...event };
        events.push(row);
        return row;
      },
    },
    cache_revisions: {
      advance: async keys => {
        revisions.push(...keys);
        return keys;
      },
    },
  };
  return { db, sessionStore, events, revisions };
}

/**
 * Issue a token, store its session, and return both.
 * @param {object} admin
 * @param {object} [overrides]
 * @returns {{token: string, session: object}}
 */
function live(admin, overrides = {}) {
  const token = createSessionToken();
  const session = sessionRow({
    token_hash: hashSessionToken(policy, token),
    ...overrides,
  });
  admin.sessionStore.set(session.token_hash, session);
  return { token, session };
}

/**
 * Build the API with a fake admin handle and the real route table.
 * @param {object} [seed]
 * @returns {{app: import('express').Express, admin: object}}
 */
function api(seed) {
  const admin = fakeAdmin(seed);
  const app = createApp({
    api: {
      admin,
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin };
}

function tenantRow(overrides = {}) {
  return {
    id: randomUUID(),
    tenant_code: 'ACME',
    name: 'Acme Construction',
    tier: 'starter',
    status: 'active',
    is_napsoft: false,
    cell_id: null,
    provisioned: true,
    rbac_ready: true,
    deactivated_at: null,
    ...overrides,
  };
}

function membershipRow(overrides = {}) {
  return {
    id: randomUUID(),
    portal_user_id: randomUUID(),
    tenant_id: randomUUID(),
    member_type: 'employee',
    status: 'active',
    ready: true,
    deactivated_at: null,
    ...overrides,
  };
}

function cellRow(overrides = {}) {
  return {
    id: randomUUID(),
    environment: 'test',
    database_name: 'nap_test_cell_acme',
    enabled: true,
    deactivated_at: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /access/tenants', () => {
  it('lists only active, ready memberships joined to eligible tenants', async () => {
    const actorId = randomUUID();
    const eligible = tenantRow();
    const ineligible = tenantRow({ status: 'suspended' });
    const notReady = tenantRow();
    const { app, admin } = api({
      tenants: [eligible, ineligible, notReady],
      memberships: [
        membershipRow({
          portal_user_id: actorId,
          tenant_id: eligible.id,
        }),
        membershipRow({
          portal_user_id: actorId,
          tenant_id: ineligible.id,
        }),
        membershipRow({
          portal_user_id: actorId,
          tenant_id: notReady.id,
          ready: false,
        }),
      ],
    });
    const { token } = live(admin, { portal_user_id: actorId });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/tenants')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([
      {
        id: eligible.id,
        code: eligible.tenant_code,
        name: eligible.name,
        tier: eligible.tier,
      },
    ]);
  });

  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app).get(
      '/api/admin-tenancy/v1/access/tenants'
    );
    expect(response.status).toBe(401);
  });
});

describe('POST /access/select', () => {
  it('succeeds when membership, tenant, cell, and runtime are all ready', async () => {
    const actorId = randomUUID();
    const cell = cellRow();
    const tenant = tenantRow({ cell_id: cell.id });
    const { admin } = api({
      tenants: [tenant],
      cells: [cell],
      memberships: [
        membershipRow({ portal_user_id: actorId, tenant_id: tenant.id }),
      ],
    });
    const { token, session } = live(admin, { portal_user_id: actorId });
    const result = await selectTenant(
      admin.db,
      policy,
      token,
      { user: session.portal_user_id, accessMode: 'normal' },
      { tenant: tenant.id },
      { runtime: { readiness: () => ({ ready: true }) } }
    );
    expect(result.session.tenant).toBe(tenant.id);
    expect(result.session.accessMode).toBe('normal');
    expect(result.token).not.toBe(token);
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'tenant.selected',
        outcome: 'succeeded',
        tenant_id: tenant.id,
      })
    );
  });

  it('refuses an ineligible membership or tenant, and an unavailable cell', async () => {
    const actorId = randomUUID();
    const readyTenant = tenantRow();
    const notMemberTenant = tenantRow();
    const suspendedTenant = tenantRow({ status: 'suspended' });
    const noCellTenant = tenantRow();
    const { app, admin } = api({
      tenants: [readyTenant, notMemberTenant, suspendedTenant, noCellTenant],
      memberships: [
        membershipRow({ portal_user_id: actorId, tenant_id: readyTenant.id }),
        membershipRow({
          portal_user_id: actorId,
          tenant_id: suspendedTenant.id,
        }),
        membershipRow({
          portal_user_id: actorId,
          tenant_id: noCellTenant.id,
        }),
      ],
    });
    const { token } = live(admin, { portal_user_id: actorId });

    const notAMember = await request(app)
      .post('/api/admin-tenancy/v1/access/select')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: notMemberTenant.id });
    expect(notAMember.status).toBe(403);

    const ineligibleTenant = await request(app)
      .post('/api/admin-tenancy/v1/access/select')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: suspendedTenant.id });
    expect(ineligibleTenant.status).toBe(403);

    const noRuntime = await request(app)
      .post('/api/admin-tenancy/v1/access/select')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: readyTenant.id });
    expect(noRuntime.status).toBe(503);
  });

  it('leaves the session unchanged on a failed selection', async () => {
    const actorId = randomUUID();
    const tenant = tenantRow();
    const { app, admin } = api({ tenants: [tenant] });
    const { token, session } = live(admin, { portal_user_id: actorId });
    await request(app)
      .post('/api/admin-tenancy/v1/access/select')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: tenant.id });
    expect(session.tenant_id).toBeNull();
    expect(session.access_mode).toBe('normal');
    const current = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(current.status).toBe(200);
  });

  it('rejects selection while already in a support session', async () => {
    const actorId = randomUUID();
    const tenant = tenantRow();
    const { app, admin } = api({ tenants: [tenant] });
    const { token } = live(admin, {
      portal_user_id: actorId,
      tenant_id: randomUUID(),
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() + 60_000),
    });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/access/select')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: tenant.id });
    expect(response.status).toBe(409);
  });
});

describe('POST /access/support', () => {
  it('denies a caller with no support capability', async () => {
    const actorId = randomUUID();
    const tenant = tenantRow();
    const { app, admin } = api({
      tenants: [tenant],
      users: [{ id: actorId, is_root: false }],
    });
    const { token } = live(admin, { portal_user_id: actorId });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: tenant.id, reason: 'investigating a billing defect' });
    expect(response.status).toBe(403);
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'support.denied',
        outcome: 'denied',
        details: { code: 'capability' },
      })
    );
  });

  it('grants root a time-limited support context, attributed to the real operator', async () => {
    const tenant = tenantRow();
    const { app, admin } = api({ tenants: [tenant] });
    const { token } = live(admin, { portal_user_id: ROOT_ID });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: tenant.id, reason: 'investigating a billing defect' });
    expect(response.status).toBe(200);
    expect(response.body.data.accessMode).toBe('support');
    expect(response.body.data.tenant).toBe(tenant.id);
    expect(
      new Date(response.body.data.accessExpiresAt).getTime()
    ).toBeLessThanOrEqual(Date.now() + 60 * 60_000 + 1000);
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'support.entered',
        outcome: 'succeeded',
        actor_id: ROOT_ID,
        tenant_id: tenant.id,
      })
    );
  });

  it('denies the Napsoft tenant without exposing that it exists, once a scope carries the restriction', async () => {
    const napsoft = tenantRow();
    const { app, admin } = api({ tenants: [napsoft] });
    const { token } = live(admin, { portal_user_id: ROOT_ID });
    vi.spyOn(authorizationModule, 'accessScope').mockReturnValue({
      platformPortalUserRead: true,
      tenantIds: '*',
      deniedTenantIds: [napsoft.id],
      archiveManagement: true,
    });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: napsoft.id, reason: 'investigating a billing defect' });
    expect(response.status).toBe(404);
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'support.denied',
        outcome: 'denied',
        details: { code: 'napsoft' },
      })
    );
  });

  it('rejects a reason outside the 10-512 character bound', async () => {
    const tenant = tenantRow();
    const { app, admin } = api({ tenants: [tenant] });
    const { token } = live(admin, { portal_user_id: ROOT_ID });
    for (const reason of ['too short', 'x'.repeat(513)]) {
      const response = await request(app)
        .post('/api/admin-tenancy/v1/access/support')
        .set('Origin', ORIGIN)
        .set('Cookie', `nap_session=${token}`)
        .send({ tenant: tenant.id, reason });
      expect(response.status).toBe(400);
    }
  });

  it('requires the effective user to exist and hold an active, ready membership', async () => {
    const tenant = tenantRow();
    const otherTenant = tenantRow();
    const effectiveUser = randomUUID();
    const { app, admin } = api({
      tenants: [tenant, otherTenant],
      users: [{ id: effectiveUser, is_root: false }],
      memberships: [
        membershipRow({
          portal_user_id: effectiveUser,
          tenant_id: otherTenant.id,
        }),
      ],
    });
    const { token } = live(admin, { portal_user_id: ROOT_ID });

    const missing = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({
        tenant: tenant.id,
        reason: 'investigating a billing defect',
        effectiveUser: randomUUID(),
      });
    expect(missing.status).toBe(404);

    const ineligible = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({
        tenant: tenant.id,
        reason: 'investigating a billing defect',
        effectiveUser,
      });
    expect(ineligible.status).toBe(403);
  });

  it('rejects entry while already in a support session', async () => {
    const tenant = tenantRow();
    const { app, admin } = api({ tenants: [tenant] });
    const { token } = live(admin, {
      portal_user_id: ROOT_ID,
      tenant_id: randomUUID(),
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() + 60_000),
    });
    const response = await request(app)
      .post('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .send({ tenant: tenant.id, reason: 'investigating a billing defect' });
    expect(response.status).toBe(409);
  });
});

describe('DELETE /access/support', () => {
  it('exits a support session, clearing context and rotating the token', async () => {
    const tenantId = randomUUID();
    const { app, admin } = api();
    const { token } = live(admin, {
      portal_user_id: ROOT_ID,
      tenant_id: tenantId,
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() + 60_000),
    });
    const response = await request(app)
      .delete('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.accessMode).toBe('normal');
    expect(response.body.data.tenant).toBeNull();
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'support.exited',
        outcome: 'succeeded',
        tenant_id: tenantId,
      })
    );
  });

  it('refuses exit from a normal session', async () => {
    const { app, admin } = api();
    const { token } = live(admin, { portal_user_id: ROOT_ID });
    const response = await request(app)
      .delete('/api/admin-tenancy/v1/access/support')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(409);
  });
});

describe('automatic access-expiry downgrade', () => {
  it('downgrades an expired support session and rotates its token on the next read', async () => {
    const tenantId = randomUUID();
    const { app, admin } = api();
    const { token } = live(admin, {
      portal_user_id: ROOT_ID,
      tenant_id: tenantId,
      access_mode: 'support',
      access_reason: 'investigating a billing defect',
      access_expires_at: new Date(Date.now() - 1000),
    });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.accessMode).toBe('normal');
    expect(response.body.data.tenant).toBeNull();
    const cookieHeader = (response.headers['set-cookie'] ?? []).find(entry =>
      entry.startsWith('nap_session=')
    );
    expect(cookieHeader).toBeDefined();
    expect(admin.events).toContainEqual(
      expect.objectContaining({
        event_key: 'support.exited',
        outcome: 'succeeded',
        actor_id: ROOT_ID,
        tenant_id: tenantId,
      })
    );

    const replay = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(replay.status).toBe(401);
  });
});
