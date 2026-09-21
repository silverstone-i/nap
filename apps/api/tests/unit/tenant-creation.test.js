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
  parseCreateTenantInput,
  parseIdempotencyKey,
  tenantView,
} from '../../src/modules/admin-tenancy/domain/tenants.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };

describe('validation', () => {
  it('normalizes a well-formed body and rejects the rest', () => {
    expect(
      parseCreateTenantInput({
        code: ' acme ',
        name: '  Acme Construction  ',
        tier: 'starter',
      })
    ).toEqual({ code: 'ACME', name: 'Acme Construction', tier: 'starter' });

    for (const bad of [
      { code: '1ACME', name: 'Acme', tier: 'starter' },
      { code: 'A', name: 'Acme', tier: 'starter' },
      { code: 'A'.repeat(33), name: 'Acme', tier: 'starter' },
      { code: 'AC-ME', name: 'Acme', tier: 'starter' },
      { code: 'ACME', name: '', tier: 'starter' },
      { code: 'ACME', name: 'A'.repeat(161), tier: 'starter' },
      { code: 'ACME', name: 'Acme', tier: 'gold' },
      { code: 'ACME', name: 'Acme' },
      { code: 'ACME', name: 'Acme', tier: 'starter', is_napsoft: true },
    ])
      expect(() => parseCreateTenantInput(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
  });

  it('accepts only a UUID idempotency key', () => {
    const key = randomUUID();
    expect(parseIdempotencyKey(key)).toBe(key);
    for (const bad of [undefined, '', 'not-a-uuid', 123])
      expect(() => parseIdempotencyKey(bad)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
  });

  it('maps a tenant row to the API camelCase contract', () => {
    const row = {
      id: 'tenant-id',
      tenant_code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
      status: 'pending',
      cell_id: null,
      provisioned: false,
      rbac_ready: false,
    };
    expect(tenantView(row)).toEqual({
      id: 'tenant-id',
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
      status: 'pending',
      cellId: null,
      provisioned: false,
      rbacReady: false,
    });
  });
});

/**
 * Build a tenant row shaped like `Tenants`' full row.
 * @param {object} [overrides]
 * @returns {object}
 */
function tenantRow(overrides = {}) {
  const created = new Date();
  return {
    id: randomUUID(),
    tenant_code: 'ACME',
    name: 'Acme Construction',
    tier: 'starter',
    status: 'pending',
    is_napsoft: false,
    cell_id: null,
    provisioned: false,
    rbac_ready: false,
    revision: 1,
    created_at: created,
    created_by: null,
    updated_at: created,
    updated_by: null,
    deactivated_at: null,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle exercising only the HTTP layer: session
 * resolution, capability gating, idempotency replay, and the response shape.
 * Concurrency and real-lock behavior are verified against real PostgreSQL in
 * the integration test.
 * @param {{tenants?: object[], failInsertWith?: unknown, failAdvanceWith?: unknown}} [seed]
 * @returns {{db: object, appended: object[], sessionStore: Map, revisions: Map, tenantStore: Map}}
 */
function fakeAdmin({ tenants = [], failInsertWith, failAdvanceWith } = {}) {
  const appended = [];
  const sessionStore = new Map();
  const tenantStore = new Map(tenants.map(row => [row.id, { ...row }]));
  const eventStore = new Map();
  const revisions = new Map();
  const db = {
    // `one` fakes the advisory-lock statement `createTenant` issues directly
    // against the transaction handle.
    tx: operation => operation({ one: async () => ({}) }),
    portal_users: {
      findOneBy: async ({ id }) => ({ id, is_root: id === ROOT_ID }),
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = sessionStore.get(hash);
        return found ? { ...found } : null;
      },
      touch: async () => null,
    },
    tenants: {
      lockActiveByCode: async code =>
        [...tenantStore.values()].find(
          row =>
            row.tenant_code.toLowerCase() === code.toLowerCase() &&
            !row.deactivated_at
        ) ?? null,
      insert: async dto => {
        if (failInsertWith) throw failInsertWith;
        const row = tenantRow(dto);
        tenantStore.set(row.id, row);
        return row;
      },
      findById: async id => {
        const found = tenantStore.get(id);
        return found ? { ...found } : null;
      },
    },
    managed_events: {
      // Mirrors `ManagedEvents.append`'s `ON CONFLICT DO NOTHING` then
      // re-select: a repeated deduplication key returns the stored event.
      append: async event => {
        const existing = eventStore.get(event.deduplication_key);
        if (existing) return existing;
        const row = { id: randomUUID(), occurred_at: new Date(), ...event };
        eventStore.set(event.deduplication_key, row);
        appended.push(row);
        return row;
      },
      findOneBy: async conditions =>
        [...eventStore.values()].find(row =>
          Object.entries(conditions).every(([key, value]) => row[key] === value)
        ) ?? null,
    },
    cache_revisions: {
      advance: async keys => {
        if (failAdvanceWith) throw failAdvanceWith;
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
  return { db, appended, sessionStore, revisions, tenantStore };
}

const ROOT_ID = randomUUID();

/**
 * Build the API with a fake admin handle and the real route table, and a
 * live session cookie for a root or ordinary actor.
 * @param {{tenants?: object[], root?: boolean, failInsertWith?: unknown, failAdvanceWith?: unknown}} [options]
 * @returns {{app: import('express').Express, admin: object, cookie: string}}
 */
function api({ tenants, root = true, failInsertWith, failAdvanceWith } = {}) {
  const admin = fakeAdmin({ tenants, failInsertWith, failAdvanceWith });
  const token = createSessionToken();
  const actorId = root ? ROOT_ID : randomUUID();
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
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin, cookie: `nap_session=${token}` };
}

const VALID_BODY = { code: 'ACME', name: 'Acme Construction', tier: 'starter' };

function post(
  app,
  cookie,
  { body = VALID_BODY, idempotencyKey = randomUUID() } = {}
) {
  return request(app)
    .post('/api/admin-tenancy/v1/tenants')
    .set('Origin', ORIGIN)
    .set('Cookie', cookie)
    .set('Idempotency-Key', idempotencyKey)
    .send(body);
}

describe('tenants route', () => {
  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/tenants')
      .set('Origin', ORIGIN)
      .set('Idempotency-Key', randomUUID())
      .send(VALID_BODY);
    expect(response.status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no control capability', async () => {
    const { app, cookie } = api({ root: false });
    const response = await post(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('rejects a malformed body', async () => {
    const { app, cookie } = api();
    const response = await post(app, cookie, {
      body: { code: 'a', name: 'Acme', tier: 'starter' },
    });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('rejects a body naming is_napsoft, for every actor', async () => {
    const { app, cookie } = api();
    const response = await post(app, cookie, {
      body: { ...VALID_BODY, is_napsoft: true },
    });
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('requires a well-formed Idempotency-Key header', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/tenants')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send(VALID_BODY);
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });

  it('creates a pending, unassigned, unprovisioned tenant', async () => {
    const { app, admin, cookie } = api();
    const response = await post(app, cookie);
    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      id: expect.any(String),
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
      status: 'pending',
      cellId: null,
      provisioned: false,
      rbacReady: false,
    });
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'tenant.created',
      outcome: 'succeeded',
    });
    expect(admin.revisions.get('tenant:list')).toBe(1);
  });

  it('reports a duplicate code as a conflict', async () => {
    const existing = tenantRow({ tenant_code: 'ACME' });
    const { app, admin, cookie } = api({ tenants: [existing] });
    const response = await post(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.CONFLICT);
    expect(admin.appended.at(-1)).toMatchObject({
      event_key: 'tenant.created',
      outcome: 'failed',
    });
  });

  it('returns the original representation for a repeated key and payload', async () => {
    const { app, cookie } = api();
    const idempotencyKey = randomUUID();
    const first = await post(app, cookie, { idempotencyKey });
    const second = await post(app, cookie, { idempotencyKey });
    expect(second.status).toBe(201);
    expect(second.body.data).toEqual(first.body.data);
  });

  it('reports a reused key with a different payload as an idempotency conflict', async () => {
    const { app, admin, cookie } = api();
    const idempotencyKey = randomUUID();
    await post(app, cookie, { idempotencyKey });
    const response = await post(app, cookie, {
      idempotencyKey,
      body: { ...VALID_BODY, name: 'Different Name' },
    });
    expect(response.status).toBe(ERROR_STATUS.IDEMPOTENCY_CONFLICT);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(admin.appended).toHaveLength(2);
    expect(admin.appended[1]).toMatchObject({ outcome: 'failed' });
  });

  it('replays the original snapshot even if the live tenant row later changed', async () => {
    const { app, admin, cookie } = api();
    const idempotencyKey = randomUUID();
    const first = await post(app, cookie, { idempotencyKey });

    const stored = admin.tenantStore.get(first.body.data.id);
    stored.name = 'Renamed Out Of Band';
    stored.tier = 'growth';

    const second = await post(app, cookie, { idempotencyKey });
    expect(second.status).toBe(201);
    expect(second.body.data).toEqual(first.body.data);
  });

  it('surfaces an unavailable cache-revision store as 503, not 500', async () => {
    const { app, cookie } = api({
      failAdvanceWith: Object.assign(new Error('unavailable'), {
        code: 'SERVICE_UNAVAILABLE',
      }),
    });
    const response = await post(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.SERVICE_UNAVAILABLE);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('records the required failure event for a database-level conflict', async () => {
    const { app, admin, cookie } = api({
      failInsertWith: Object.assign(new Error('serialization failure'), {
        code: '40001',
      }),
    });
    const response = await post(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.CONFLICT);
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'tenant.created',
      outcome: 'failed',
    });
  });
});
