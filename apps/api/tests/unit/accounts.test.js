/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ERROR_STATUS } from '../../src/framework/envelope.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';
import {
  jobView,
  membershipView,
  reportProvisioningResult,
  userView,
} from '../../src/modules/admin-tenancy/domain/accounts.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };
const HASHING = { memoryKib: 19456, timeCost: 2, parallelism: 1 };
const ROOT_ID = randomUUID();

describe('views', () => {
  it('maps a portal-user row to the API camelCase contract', () => {
    const deactivatedAt = new Date();
    expect(
      userView({
        id: 'u1',
        email: 'a@example.com',
        status: 'disabled',
        must_change_password: false,
        deactivated_at: deactivatedAt,
      })
    ).toEqual({
      id: 'u1',
      email: 'a@example.com',
      status: 'disabled',
      mustChangePassword: false,
      deactivatedAt,
    });
  });

  it('maps a membership row to the API camelCase contract', () => {
    expect(
      membershipView({
        id: 'm1',
        portal_user_id: 'u1',
        tenant_id: 't1',
        member_type: 'employee',
        status: 'pending',
        member_id: null,
        ready: false,
        deactivated_at: null,
      })
    ).toEqual({
      id: 'm1',
      portalUserId: 'u1',
      tenantId: 't1',
      memberType: 'employee',
      status: 'pending',
      memberId: null,
      ready: false,
      deactivatedAt: null,
    });
  });

  it('maps a job row to the API camelCase contract', () => {
    expect(
      jobView({
        id: 'j1',
        tenant_id: 't1',
        membership_id: 'm1',
        kind: 'employee',
        status: 'queued',
        attempts: 0,
        result_member_id: null,
        failure_code: null,
      })
    ).toEqual({
      id: 'j1',
      tenantId: 't1',
      membershipId: 'm1',
      kind: 'employee',
      status: 'queued',
      attempts: 0,
      resultMemberId: null,
      failureCode: null,
    });
  });
});

/**
 * Build an in-memory admin handle exercising the HTTP layer: session
 * resolution, capability gating, idempotency replay, and lifecycle
 * transitions. Concurrency and real constraint enforcement are verified
 * against real PostgreSQL in the integration test.
 * @returns {object}
 */
function fakeAdmin() {
  const appended = [];
  const sessionStore = new Map();
  const userStore = new Map();
  const membershipStore = new Map();
  const jobStore = new Map();
  const tenantStore = new Map();
  const eventStore = new Map();
  const revisions = new Map();

  function matches(row, conditions) {
    return Object.entries(conditions).every(
      ([key, value]) => row[key] === value
    );
  }

  const db = {
    tx: operation => operation({ one: async () => ({}) }),
    portal_users: {
      findOneBy: async conditions => {
        const found = [...userStore.values()].find(row =>
          matches(row, conditions)
        );
        return found ? { ...found } : null;
      },
      lockById: async id => {
        const found = userStore.get(id);
        return found ? { ...found } : null;
      },
      lockActiveByEmail: async email => {
        const found = [...userStore.values()].find(
          row =>
            row.email.toLowerCase() === email.toLowerCase() &&
            !row.deactivated_at
        );
        return found ? { ...found } : null;
      },
      insert: async dto => {
        const row = {
          id: randomUUID(),
          deactivated_at: null,
          ...dto,
        };
        userStore.set(row.id, row);
        return { ...row };
      },
      update: async (id, dto) => {
        const found = userStore.get(id);
        if (!found || found.deactivated_at) return null;
        Object.assign(found, dto);
        return { ...found };
      },
      removeWhere: async ({ id }) => {
        const found = userStore.get(id);
        if (!found || found.deactivated_at) return 0;
        found.deactivated_at = new Date();
        return 1;
      },
      restoreWhere: async ({ id }) => {
        const found = userStore.get(id);
        if (!found || !found.deactivated_at) return 0;
        found.deactivated_at = null;
        return 1;
      },
      findAfterCursor: async (cursor, limit, orderBy, options = {}) => {
        const { filters = {}, includeDeactivated = false } = options;
        const rows = [...userStore.values()]
          .filter(row => matches(row, filters))
          .filter(row => includeDeactivated || !row.deactivated_at)
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .filter(row => !cursor?.id || row.id > cursor.id);
        const page = rows.slice(0, limit);
        return {
          rows: page,
          nextCursor: rows.length > limit ? { id: page.at(-1).id } : null,
        };
      },
    },
    portal_user_tenants: {
      lockByUserAndTenant: async (portalUserId, tenantId) => {
        const found = [...membershipStore.values()].find(
          row =>
            row.portal_user_id === portalUserId &&
            row.tenant_id === tenantId &&
            !row.deactivated_at
        );
        return found ? { ...found } : null;
      },
      lockById: async id => {
        const found = membershipStore.get(id);
        return found ? { ...found } : null;
      },
      insert: async dto => {
        const row = { id: randomUUID(), deactivated_at: null, ...dto };
        membershipStore.set(row.id, row);
        return { ...row };
      },
      update: async (id, dto) => {
        const found = membershipStore.get(id);
        if (!found) return null;
        Object.assign(found, dto);
        return { ...found };
      },
      removeWhere: async ({ id }) => {
        const found = membershipStore.get(id);
        if (!found || found.deactivated_at) return 0;
        found.deactivated_at = new Date();
        return 1;
      },
      restoreWhere: async ({ id }) => {
        const found = membershipStore.get(id);
        if (!found || !found.deactivated_at) return 0;
        found.deactivated_at = null;
        return 1;
      },
    },
    provisioning_jobs: {
      findOneBy: async conditions => {
        const found = [...jobStore.values()].find(row =>
          matches(row, conditions)
        );
        return found ? { ...found } : null;
      },
      lockById: async id => {
        const found = jobStore.get(id);
        return found ? { ...found } : null;
      },
      insert: async dto => {
        const row = { id: randomUUID(), ...dto };
        jobStore.set(row.id, row);
        return { ...row };
      },
      update: async (id, dto) => {
        const found = jobStore.get(id);
        if (!found) return null;
        Object.assign(found, dto);
        return { ...found };
      },
    },
    tenants: {
      findOneBy: async conditions => {
        const found = [...tenantStore.values()].find(row =>
          matches(row, conditions)
        );
        return found ? { ...found } : null;
      },
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = sessionStore.get(hash);
        return found ? { ...found } : null;
      },
      touch: async () => null,
      archiveForUser: async (portalUserId, exceptId) => {
        const archived = [];
        for (const [hash, row] of sessionStore) {
          if (
            row.portal_user_id === portalUserId &&
            !row.deactivated_at &&
            row.id !== exceptId
          ) {
            row.deactivated_at = new Date();
            archived.push({ id: row.id, tenant_id: row.tenant_id });
          }
          void hash;
        }
        return archived;
      },
      archiveForUserAndTenant: async (portalUserId, tenantId) => {
        const archived = [];
        for (const row of sessionStore.values()) {
          if (
            row.portal_user_id === portalUserId &&
            row.tenant_id === tenantId &&
            !row.deactivated_at
          ) {
            row.deactivated_at = new Date();
            archived.push({ id: row.id, tenant_id: row.tenant_id });
          }
        }
        return archived;
      },
    },
    managed_events: {
      append: async event => {
        const existing = eventStore.get(event.deduplication_key);
        if (existing) return existing;
        const row = { id: randomUUID(), occurred_at: new Date(), ...event };
        eventStore.set(event.deduplication_key, row);
        appended.push(row);
        return row;
      },
      findOneBy: async conditions =>
        [...eventStore.values()].find(row => matches(row, conditions)) ?? null,
    },
    cache_revisions: {
      advance: async keys => {
        for (const key of keys) {
          const id = `${key.domain}:${key.entity}`;
          revisions.set(id, (revisions.get(id) ?? 0) + 1);
        }
        return keys.map(key => ({
          ...key,
          revision: String(revisions.get(`${key.domain}:${key.entity}`)),
        }));
      },
    },
  };
  return {
    db,
    appended,
    sessionStore,
    userStore,
    membershipStore,
    jobStore,
    tenantStore,
    revisions,
  };
}

/**
 * Build the API with a fake admin handle and the real route table, and a
 * live session cookie for a root or ordinary actor.
 * @param {{root?: boolean}} [options]
 * @returns {{app: import('express').Express, admin: object, cookie: string, actorId: string}}
 */
function api({ root = true } = {}) {
  const admin = fakeAdmin();
  const token = createSessionToken();
  const actorId = root ? ROOT_ID : randomUUID();
  admin.userStore.set(actorId, {
    id: actorId,
    email: root ? 'root@example.com' : 'operator@example.com',
    status: 'active',
    must_change_password: false,
    is_root: root,
    deactivated_at: null,
  });
  admin.sessionStore.set(hashSessionToken(policy, token), {
    id: randomUUID(),
    portal_user_id: actorId,
    tenant_id: null,
    access_mode: 'normal',
    effective_user_id: null,
    access_reason: null,
    access_expires_at: null,
    last_seen_at: new Date(),
    idle_expires_at: new Date(Date.now() + 30 * 60_000),
    absolute_expires_at: new Date(Date.now() + 12 * 3_600_000),
    created_at: new Date(),
    updated_at: new Date(),
    deactivated_at: null,
    user_status: 'active',
    must_change_password: false,
    user_archived: false,
    expired: false,
    stale: false,
  });
  const app = createApp({
    api: {
      admin,
      environment: 'test',
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      authenticationPolicy: { throttleSecret: 'a'.repeat(32), ...HASHING },
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin, cookie: `nap_session=${token}`, actorId };
}

/** Seed a plain tenant row. */
function seedTenant(admin, overrides = {}) {
  const row = { id: randomUUID(), is_napsoft: false, ...overrides };
  admin.tenantStore.set(row.id, row);
  return row;
}

/** Seed an ordinary portal user row. */
function seedUser(admin, overrides = {}) {
  const row = {
    id: randomUUID(),
    email: `user-${randomUUID()}@example.com`,
    status: 'active',
    must_change_password: false,
    is_root: false,
    deactivated_at: null,
    ...overrides,
  };
  admin.userStore.set(row.id, row);
  return row;
}

/** Seed a membership row. */
function seedMembership(admin, overrides = {}) {
  const row = {
    id: randomUUID(),
    portal_user_id: randomUUID(),
    tenant_id: randomUUID(),
    member_type: 'employee',
    status: 'pending',
    member_id: null,
    ready: false,
    deactivated_at: null,
    ...overrides,
  };
  admin.membershipStore.set(row.id, row);
  return row;
}

/** Seed a provisioning-job row. */
function seedJob(admin, overrides = {}) {
  const row = {
    id: randomUUID(),
    tenant_id: randomUUID(),
    membership_id: randomUUID(),
    kind: 'employee',
    status: 'queued',
    attempts: 0,
    result_member_id: null,
    failure_code: null,
    ...overrides,
  };
  admin.jobStore.set(row.id, row);
  return row;
}

const BASE = '/api/admin-tenancy/v1/accounts';

describe('users', () => {
  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'a@example.com', password: 'a-long-enough-password' });
    expect(response.status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no accounts capability', async () => {
    const { app, cookie } = api({ root: false });
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'a@example.com', password: 'a-long-enough-password' });
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('rejects a malformed body', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'not-an-email', password: 'a-long-enough-password' });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('rejects a password shorter than the WU3 minimum', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'a@example.com', password: 'short' });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('requires a well-formed Idempotency-Key header', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ email: 'a@example.com', password: 'a-long-enough-password' });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('creates an active user requiring a password change, trimmed and lowercased', async () => {
    const { app, admin, cookie } = api();
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        email: '  Person@Example.com  ',
        password: 'a-long-enough-password',
      });
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      id: expect.any(String),
      email: 'person@example.com',
      status: 'active',
      mustChangePassword: true,
      deactivatedAt: null,
    });
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'user.created',
      outcome: 'succeeded',
    });
    expect(admin.revisions.get('user:list')).toBe(1);
  });

  it('reuses an existing active user by email instead of creating a duplicate', async () => {
    const { app, admin, cookie } = api();
    const existing = seedUser(admin, { email: 'reused@example.com' });
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        email: 'reused@example.com',
        password: 'a-long-enough-password',
      });
    expect(response.status).toBe(201);
    expect(response.body.data.id).toBe(existing.id);
    expect(admin.userStore.size).toBe(2); // the actor plus the reused user, no new row
  });

  it('reports a non-active email collision as a conflict', async () => {
    const { app, admin, cookie } = api();
    seedUser(admin, { email: 'disabled@example.com', status: 'disabled' });
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        email: 'disabled@example.com',
        password: 'a-long-enough-password',
      });
    expect(response.status).toBe(ERROR_STATUS.CONFLICT);
  });

  it('replays the original response for a repeated key and payload', async () => {
    const { app, cookie } = api();
    const idempotencyKey = randomUUID();
    const body = {
      email: 'once@example.com',
      password: 'a-long-enough-password',
    };
    const first = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    const second = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    expect(second.body.data).toEqual(first.body.data);
  });

  it('reports a reused key with a different email as an idempotency conflict', async () => {
    const { app, cookie } = api();
    const idempotencyKey = randomUUID();
    await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({ email: 'first@example.com', password: 'a-long-enough-password' });
    const response = await request(app)
      .post(`${BASE}/users`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        email: 'second@example.com',
        password: 'a-long-enough-password',
      });
    expect(response.status).toBe(ERROR_STATUS.IDEMPOTENCY_CONFLICT);
  });

  it('reads a safe user view', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    const response = await request(app)
      .get(`${BASE}/users/${user.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      id: user.id,
      email: user.email,
      status: 'active',
      mustChangePassword: false,
      deactivatedAt: null,
    });
  });

  it('reports a missing user as not found', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .get(`${BASE}/users/${randomUUID()}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('never exposes the root account through this module', async () => {
    const { app, cookie, actorId } = api();
    const response = await request(app)
      .get(`${BASE}/users/${actorId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('changes email and status, and disabling revokes every live session', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    admin.sessionStore.set('other-session-hash', {
      id: randomUUID(),
      portal_user_id: user.id,
      tenant_id: null,
      deactivated_at: null,
    });
    const response = await request(app)
      .patch(`${BASE}/users/${user.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ email: 'changed@example.com', status: 'disabled' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      email: 'changed@example.com',
      status: 'disabled',
    });
    expect(
      admin.sessionStore.get('other-session-hash').deactivated_at
    ).not.toBeNull();
    expect(admin.appended.at(-1)).toMatchObject({ event_key: 'user.disabled' });
  });

  it('archives a user and repeats as a no-op', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    const first = await request(app)
      .delete(`${BASE}/users/${user.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(first.status).toBe(204);
    const second = await request(app)
      .delete(`${BASE}/users/${user.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(second.status).toBe(204);
    expect(
      admin.appended.filter(e => e.event_key === 'user.archived')
    ).toHaveLength(1);
  });

  it('restores an archived user as disabled', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    await request(app)
      .delete(`${BASE}/users/${user.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    const response = await request(app)
      .post(`${BASE}/users/${user.id}/restore`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'disabled',
      deactivatedAt: null,
    });
  });

  it('refuses to restore a user that is not archived', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    const response = await request(app)
      .post(`${BASE}/users/${user.id}/restore`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(ERROR_STATUS.INVALID_STATE);
  });
});

describe('GET /users list', () => {
  function get(app, cookie, query = '') {
    return request(app)
      .get(`${BASE}/users${query}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  }

  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app)
      .get(`${BASE}/users`)
      .set('Origin', ORIGIN);
    expect(response.status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no accounts capability', async () => {
    const { app, cookie } = api({ root: false });
    const response = await get(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('lists portal-user accounts as the safe userListView shape, including root read-only', async () => {
    const { app, admin, cookie, actorId } = api();
    const user = seedUser(admin, { email: 'a@example.com' });
    const response = await get(app, cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.rows).toHaveLength(2);
    expect(response.body.data.rows).toContainEqual({
      ...userView(user),
      isRoot: false,
    });
    expect(response.body.data.rows).toContainEqual(
      expect.objectContaining({ id: actorId, isRoot: true })
    );
  });

  it('includes an archived user, so it remains reachable for Restore', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin, { deactivated_at: new Date() });
    const response = await get(app, cookie);
    expect(response.body.data.rows).toContainEqual({
      ...userView(user),
      deactivatedAt: user.deactivated_at.toISOString(),
      isRoot: false,
    });
  });

  it('paginates with cursor and limit, root included in the count', async () => {
    const { app, admin, cookie, actorId } = api();
    const users = Array.from({ length: 3 }, () => seedUser(admin));
    const allIds = [...users.map(u => u.id), actorId].sort();

    const seen = [];
    let query = '?limit=2';
    for (;;) {
      const page = await get(app, cookie, query);
      seen.push(...page.body.data.rows);
      if (!page.body.data.nextCursor) break;
      query = `?limit=2&cursor=${encodeURIComponent(page.body.data.nextCursor)}`;
    }
    expect(seen.map(row => row.id)).toEqual(allIds);
  });

  it('rejects an out-of-range limit', async () => {
    const { app, cookie } = api();
    const response = await get(app, cookie, '?limit=0');
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });
});

describe('memberships', () => {
  function membershipBody(admin, overrides = {}) {
    const tenant = overrides.tenant ?? seedTenant(admin);
    const user = overrides.user ?? seedUser(admin);
    return {
      body: {
        portalUserId: user.id,
        tenantId: tenant.id,
        memberType: 'employee',
        ...overrides.body,
      },
      tenant,
      user,
    };
  }

  it('creates a pending membership and a queued job atomically', async () => {
    const { app, admin, cookie } = api();
    const { body } = membershipBody(admin);
    const response = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    expect(response.status).toBe(201);
    expect(response.body.data.membership).toMatchObject({
      portalUserId: body.portalUserId,
      tenantId: body.tenantId,
      memberType: 'employee',
      status: 'pending',
      ready: false,
    });
    expect(response.body.data.job).toMatchObject({
      tenantId: body.tenantId,
      kind: 'employee',
      status: 'queued',
      attempts: 0,
    });
    expect(admin.revisions.get('membership:list')).toBe(1);
  });

  it('reports a missing tenant or user as not found', async () => {
    const { app, admin, cookie } = api();
    const user = seedUser(admin);
    const missingTenant = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        portalUserId: user.id,
        tenantId: randomUUID(),
        memberType: 'employee',
      });
    expect(missingTenant.status).toBe(ERROR_STATUS.NOT_FOUND);

    const tenant = seedTenant(admin);
    const missingUser = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        portalUserId: randomUUID(),
        tenantId: tenant.id,
        memberType: 'employee',
      });
    expect(missingUser.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('rejects a second membership for the same user and tenant', async () => {
    const { app, admin, cookie } = api();
    const { body } = membershipBody(admin);
    await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    const response = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send(body);
    expect(response.status).toBe(ERROR_STATUS.CONFLICT);
  });

  it('replays the original membership and job for a repeated key and payload', async () => {
    const { app, admin, cookie } = api();
    const { body } = membershipBody(admin);
    const idempotencyKey = randomUUID();
    const first = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    const second = await request(app)
      .post(`${BASE}/memberships`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send(body);
    expect(second.body.data).toEqual(first.body.data);
  });

  it('suspends an active membership, clears readiness, and revokes tenant sessions', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, {
      status: 'active',
      ready: true,
      member_id: randomUUID(),
    });
    admin.sessionStore.set('tenant-session', {
      id: randomUUID(),
      portal_user_id: membership.portal_user_id,
      tenant_id: membership.tenant_id,
      deactivated_at: null,
    });
    const response = await request(app)
      .patch(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ status: 'suspended' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'suspended',
      ready: false,
    });
    expect(
      admin.sessionStore.get('tenant-session').deactivated_at
    ).not.toBeNull();
  });

  it('refuses to suspend a pending membership', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, { status: 'pending' });
    const response = await request(app)
      .patch(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ status: 'suspended' });
    expect(response.status).toBe(ERROR_STATUS.INVALID_STATE);
  });

  it('reactivates a suspended membership without restoring readiness', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, {
      status: 'suspended',
      ready: false,
    });
    const response = await request(app)
      .patch(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ status: 'active' });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'active',
      ready: false,
    });
  });

  it('never lets this route touch the root membership', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, {
      member_type: null,
      status: 'active',
    });
    const response = await request(app)
      .patch(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ status: 'suspended' });
    expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('archives a membership and repeats as a no-op', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, { status: 'active', ready: true });
    const first = await request(app)
      .delete(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(first.status).toBe(204);
    const second = await request(app)
      .delete(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(second.status).toBe(204);
    expect(
      admin.appended.filter(e => e.event_key === 'membership.archived')
    ).toHaveLength(1);
  });

  it('restores an archived membership as suspended and not ready', async () => {
    const { app, admin, cookie } = api();
    const membership = seedMembership(admin, { status: 'active', ready: true });
    await request(app)
      .delete(`${BASE}/memberships/${membership.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    const response = await request(app)
      .post(`${BASE}/memberships/${membership.id}/restore`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'suspended',
      ready: false,
    });
  });
});

describe('provisioning jobs', () => {
  it('reads a safe job view', async () => {
    const { app, admin, cookie } = api();
    const job = seedJob(admin);
    const response = await request(app)
      .get(`${BASE}/jobs/${job.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ id: job.id, status: 'queued' });
  });

  it('reports a missing job as not found', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .get(`${BASE}/jobs/${randomUUID()}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('requeues a failed job and increments its attempt count', async () => {
    const { app, admin, cookie } = api();
    const job = seedJob(admin, {
      status: 'failed',
      attempts: 1,
      failure_code: 'boom',
    });
    const response = await request(app)
      .post(`${BASE}/jobs/${job.id}/retry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'queued',
      attempts: 2,
      failureCode: null,
    });
  });

  it('leaves a queued or running job unchanged on retry', async () => {
    const { app, admin, cookie } = api();
    const job = seedJob(admin, { status: 'running', attempts: 1 });
    const response = await request(app)
      .post(`${BASE}/jobs/${job.id}/retry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      status: 'running',
      attempts: 1,
    });
  });

  it('refuses to retry a completed job', async () => {
    const { app, admin, cookie } = api();
    const job = seedJob(admin, {
      status: 'completed',
      result_member_id: randomUUID(),
    });
    const response = await request(app)
      .post(`${BASE}/jobs/${job.id}/retry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
    expect(response.status).toBe(ERROR_STATUS.INVALID_STATE);
  });

  it('a completed report activates the membership and stamps its member id', async () => {
    const admin = fakeAdmin();
    const membership = seedMembership(admin, {
      status: 'pending',
      ready: false,
    });
    const job = seedJob(admin, {
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
    });
    const resultMemberId = randomUUID();

    const result = await reportProvisioningResult(admin.db, job.id, {
      kind: 'completed',
      resultMemberId,
    });
    expect(result).toMatchObject({ status: 'completed', resultMemberId });
    expect(admin.membershipStore.get(membership.id)).toMatchObject({
      status: 'active',
      ready: true,
      member_id: resultMemberId,
    });
    expect(admin.appended.at(-1)).toMatchObject({
      event_key: 'membership.provisioning.completed',
      outcome: 'succeeded',
    });
  });

  it('a failed report leaves the membership pending and not ready', async () => {
    const admin = fakeAdmin();
    const membership = seedMembership(admin, {
      status: 'pending',
      ready: false,
    });
    const job = seedJob(admin, {
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
    });

    const result = await reportProvisioningResult(admin.db, job.id, {
      kind: 'failed',
      failureCode: 'cell_unavailable',
    });
    expect(result).toMatchObject({
      status: 'failed',
      failureCode: 'cell_unavailable',
    });
    expect(admin.membershipStore.get(membership.id)).toMatchObject({
      status: 'pending',
      ready: false,
    });
    expect(admin.appended.at(-1)).toMatchObject({
      event_key: 'membership.provisioning.failed',
      outcome: 'failed',
    });
  });

  it('refuses a result for an already-completed job', async () => {
    const admin = fakeAdmin();
    const membership = seedMembership(admin);
    const job = seedJob(admin, {
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
      status: 'completed',
      result_member_id: randomUUID(),
    });
    await expect(
      reportProvisioningResult(admin.db, job.id, {
        kind: 'completed',
        resultMemberId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });

  it('refuses a late report for a membership archived while the job was in flight', async () => {
    const admin = fakeAdmin();
    const membership = seedMembership(admin, {
      status: 'pending',
      ready: false,
      deactivated_at: new Date(),
    });
    const job = seedJob(admin, {
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
    });
    await expect(
      reportProvisioningResult(admin.db, job.id, {
        kind: 'completed',
        resultMemberId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
    expect(admin.membershipStore.get(membership.id)).toMatchObject({
      status: 'pending',
      ready: false,
    });
    expect(admin.jobStore.get(job.id)).toMatchObject({ status: 'queued' });
  });

  it('never lets a provisioning report touch the root membership', async () => {
    const admin = fakeAdmin();
    const membership = seedMembership(admin, {
      member_type: null,
      status: 'active',
      ready: true,
    });
    const job = seedJob(admin, {
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
    });
    await expect(
      reportProvisioningResult(admin.db, job.id, {
        kind: 'completed',
        resultMemberId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
});
