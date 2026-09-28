/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  accessContextResponseSchema,
  sessionCapabilitiesSchema,
} from '@nap/shared';
import { createApp } from '../../src/app.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };

/**
 * Whether a stored row matches an equality filter — enough of pg-schemata's
 * `findOneBy` semantics for these tests.
 * @param {object} row
 * @param {object} filter
 * @returns {boolean}
 */
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => row[key] === value);
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
    last_seen_at: created,
    idle_expires_at: new Date(created.getTime() + 30 * 60_000),
    absolute_expires_at: new Date(created.getTime() + 12 * 3_600_000),
    deactivated_at: null,
    user_status: 'active',
    must_change_password: false,
    user_archived: false,
    expired: false,
    stale: false,
    ...overrides,
  };
}

function tenantRow(overrides = {}) {
  return {
    id: randomUUID(),
    tenant_code: 'ACME',
    name: 'Acme Construction',
    tier: 'starter',
    status: 'active',
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
    status: 'active',
    ready: true,
    deactivated_at: null,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle covering every table the `/access/context`
 * route touches: the caller's own account, its eligible-tenant memberships,
 * its selected tenant (if any), and the session store `sessionContext`
 * resolves against.
 * @param {{users?: object[], tenants?: object[], memberships?: object[]}} [seed]
 * @returns {{db: object, sessionStore: Map}}
 */
function fakeAdmin({ users = [], tenants = [], memberships = [] } = {}) {
  const sessionStore = new Map();
  const userStore = new Map(
    users.map(row => [
      row.id,
      { status: 'active', deactivated_at: null, ...row },
    ])
  );
  const tenantStore = new Map(tenants.map(row => [row.id, { ...row }]));

  const db = {
    tx: operation => operation({}),
    portal_users: {
      findOneBy: async filter => {
        const found = [...userStore.values()].find(row => matches(row, filter));
        return found ? { ...found } : null;
      },
    },
    portal_user_tenants: {
      findWhere: async filter =>
        memberships
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
          .filter(
            row =>
              !row.deactivated_at &&
              Object.entries(filter).every(([key, value]) =>
                value && typeof value === 'object' && '$in' in value
                  ? value.$in.includes(row[key])
                  : row[key] === value
              )
          )
          .map(row => ({ ...row })),
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = sessionStore.get(hash);
        return found && !found.deactivated_at ? { ...found } : null;
      },
      touch: async () => null,
    },
    managed_events: { append: async event => event },
    cache_revisions: { advance: async keys => keys },
  };
  return { db, sessionStore };
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
 * Build the API with a fake admin handle and the real route table. The
 * revision-cache stub serves `patterns` as every caller's resolved set.
 * @param {object} [seed]
 * @param {string[]} [patterns]
 * @returns {{app: import('express').Express, admin: object}}
 */
function api(seed, patterns = []) {
  const admin = fakeAdmin(seed);
  const app = createApp({
    api: {
      admin,
      cache: { getOrLoad: async () => [...patterns] },
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GET /access/context', () => {
  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app).get(
      '/api/admin-tenancy/v1/access/context'
    );
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a restricted session, same as GET /session/current', async () => {
    const actorId = randomUUID();
    const { app, admin } = api({
      users: [{ id: actorId, email: 'user@example.com' }],
    });
    const { token } = live(admin, {
      portal_user_id: actorId,
      must_change_password: true,
    });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/context')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('resolves no entry points and no tenant for a plain user', async () => {
    const actorId = randomUUID();
    const { app, admin } = api({
      users: [{ id: actorId, email: 'user@example.com' }],
    });
    const { token } = live(admin, { portal_user_id: actorId });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/context')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(() =>
      accessContextResponseSchema.parse(response.body)
    ).not.toThrow();
    expect(response.body.data).toMatchObject({
      user: { id: actorId, email: 'user@example.com' },
      selectedTenant: null,
      operator: null,
      entryPoints: { tenant: false },
    });
  });

  it("reports the platform operator's own company regardless of the caller's tenant context", async () => {
    const actorId = randomUUID();
    const operatorTenant = tenantRow({
      name: 'Napsoft, LLC',
      tenant_code: 'NAP',
      is_napsoft: true,
    });
    const { app, admin } = api({
      users: [{ id: actorId, email: 'root@example.com' }],
      tenants: [operatorTenant],
    });
    const { token } = live(admin, { portal_user_id: actorId });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/context')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.operator).toEqual({
      id: operatorTenant.id,
      code: operatorTenant.tenant_code,
      name: 'Napsoft, LLC',
      tier: operatorTenant.tier,
    });
  });

  it('reports tenant entry and the selected tenant view', async () => {
    const actorId = randomUUID();
    const tenant = tenantRow();
    const { app, admin } = api({
      users: [{ id: actorId, email: 'user@example.com' }],
      tenants: [tenant],
      memberships: [
        membershipRow({ portal_user_id: actorId, tenant_id: tenant.id }),
      ],
    });
    const { token } = live(admin, {
      portal_user_id: actorId,
      tenant_id: tenant.id,
    });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/context')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.entryPoints).toEqual({ tenant: true });
    expect(response.body.data.selectedTenant).toEqual({
      id: tenant.id,
      code: tenant.tenant_code,
      name: tenant.name,
      tier: tenant.tier,
    });
  });

  it('never exposes a token, password, or role field', async () => {
    const actorId = randomUUID();
    const { app, admin } = api({
      users: [{ id: actorId, email: 'user@example.com' }],
    });
    const { token } = live(admin, { portal_user_id: actorId });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/access/context')
      .set('Cookie', `nap_session=${token}`);
    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['password', 'token', 'role', 'capabilit'])
      expect(serialized.toLowerCase()).not.toContain(forbidden);
  });
});

describe('GET /session/capabilities (I0005-R010)', () => {
  const napsoft = tenantRow({
    tenant_code: 'NAP',
    is_napsoft: true,
    cell_id: randomUUID(),
  });

  async function capabilities(seed, patterns, session = {}) {
    const actorId = seed.users[0].id;
    const { app, admin } = api(seed, patterns);
    const { token } = live(admin, { portal_user_id: actorId, ...session });
    const response = await request(app)
      .get('/api/admin-tenancy/v1/session/capabilities')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(() =>
      sessionCapabilitiesSchema.parse(response.body.data)
    ).not.toThrow();
    return response.body.data;
  }

  it("reads a Napsoft member's patterns from Napsoft, whatever the target", async () => {
    const actorId = randomUUID();
    const acme = tenantRow({ cell_id: randomUUID() });
    const data = await capabilities(
      {
        users: [{ id: actorId, email: 'staff@example.com' }],
        tenants: [napsoft, acme],
        memberships: [
          membershipRow({ portal_user_id: actorId, tenant_id: napsoft.id }),
          membershipRow({ portal_user_id: actorId, tenant_id: acme.id }),
        ],
      },
      ['*::*::*::read'],
      { tenant_id: acme.id }
    );
    expect(data).toEqual({
      patterns: ['*::*::*::read'],
      homeTenant: { id: napsoft.id, code: 'NAP' },
      targetTenant: { id: acme.id, code: 'ACME' },
      napsoftTenant: { id: napsoft.id, code: 'NAP' },
    });
  });

  it('uses the target tenant as home for a customer member', async () => {
    const actorId = randomUUID();
    const acme = tenantRow({ cell_id: randomUUID() });
    const data = await capabilities(
      {
        users: [{ id: actorId, email: 'user@example.com' }],
        tenants: [napsoft, acme],
        memberships: [
          membershipRow({ portal_user_id: actorId, tenant_id: acme.id }),
        ],
      },
      ['ACME::*::*::*'],
      { tenant_id: acme.id }
    );
    expect(data.homeTenant).toEqual({ id: acme.id, code: 'ACME' });
    expect(data.patterns).toEqual(['ACME::*::*::*']);
  });

  it('resolves nothing for a user with no active membership', async () => {
    const actorId = randomUUID();
    const data = await capabilities(
      {
        users: [{ id: actorId, email: 'user@example.com' }],
        tenants: [napsoft],
      },
      ['*::*::*::*']
    );
    expect(data).toEqual({
      patterns: [],
      homeTenant: null,
      targetTenant: null,
      napsoftTenant: { id: napsoft.id, code: 'NAP' },
    });
  });
});
