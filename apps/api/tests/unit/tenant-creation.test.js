/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { authorizeActor } from './helpers/authorization.js';
import { ERROR_STATUS } from '../../src/framework/envelope.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import { executeProvisionCommand } from '../../src/modules/admin-tenancy/domain/cells.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';
import {
  tenantCodeSchema,
  tenantNameSchema,
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
  it('normalizes a tenant code and name and rejects the rest', () => {
    expect(tenantCodeSchema.parse(' acme ')).toBe('ACME');
    expect(tenantNameSchema.parse('  Acme Construction  ')).toBe(
      'Acme Construction'
    );
    for (const bad of ['1ACME', 'A', 'A'.repeat(33), 'AC-ME', 7])
      expect(tenantCodeSchema.safeParse(bad).success).toBe(false);
    for (const bad of ['', '   ', 'A'.repeat(161)])
      expect(tenantNameSchema.safeParse(bad).success).toBe(false);
  });

  it('requires a client, code, name, tier, cell, and administrator to provision (I0006-R001)', async () => {
    const valid = {
      operation: 'tenant-provision',
      client: randomUUID(),
      code: 'ACME',
      name: 'Acme',
      tier: 'starter',
      cell: randomUUID(),
      admin: {
        email: 'a@acme.test',
        password: 'pw',
        firstName: 'Ann',
        lastName: 'Lee',
      },
    };
    const noClient = { ...valid };
    delete noClient.client;
    for (const bad of [
      noClient,
      { ...valid, tenant: randomUUID() },
      { ...valid, code: '1ACME' },
      { ...valid, tier: 'gold' },
      { ...valid, client: 'not-a-uuid' },
    ])
      await expect(
        executeProvisionCommand(
          {},
          { actorId: randomUUID(), granted: true },
          bad
        )
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
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
      client_id: 'client-id',
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
      clientId: 'client-id',
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
    client_id: null,
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
      findOneBy: async ({ id }) => ({ id }),
    },
    tenant_provisioning: {
      findWhere: async () => [],
      hasActive: async () => false,
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
      findWhere: async ({ client_id }) =>
        [...tenantStore.values()].filter(row => row.client_id === client_id),
      findAfterCursor: async (cursor, limit) => {
        const rows = [...tenantStore.values()]
          .sort((a, b) => (a.id < b.id ? -1 : 1))
          .filter(row => !cursor?.id || row.id > cursor.id);
        const page = rows.slice(0, limit);
        return {
          rows: page,
          nextCursor: rows.length > limit ? { id: page.at(-1).id } : null,
        };
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
  const cache = authorizeActor(admin.db, ROOT_ID);
  const app = createApp({
    api: {
      admin,
      cache,
      environment: 'test',
      sessionPolicy: policy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin, cookie: `nap_session=${token}` };
}

describe('POST /tenants', () => {
  it('is gone: tenants are created only from a Napsoft client (I0006-R001)', async () => {
    const { app, cookie } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/tenants')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({ code: 'ACME', name: 'Acme', tier: 'starter' });
    expect(response.status).toBe(404);
  });
});

describe('GET /tenants', () => {
  function get(app, cookie, query = '') {
    return request(app)
      .get(`/api/admin-tenancy/v1/tenants${query}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);
  }

  it('requires a session', async () => {
    const { app } = api();
    const response = await request(app)
      .get('/api/admin-tenancy/v1/tenants')
      .set('Origin', ORIGIN);
    expect(response.status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no control capability', async () => {
    const { app, cookie } = api({ root: false });
    const response = await get(app, cookie);
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('lists tenants as the safe tenantView shape, newest-id-last', async () => {
    const first = tenantRow({ tenant_code: 'AAA' });
    const second = tenantRow({ tenant_code: 'BBB' });
    const { app, cookie } = api({ tenants: [first, second] });
    const response = await get(app, cookie);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.rows).toEqual(
      [first, second]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map(row => ({ ...tenantView(row), job: null }))
    );
    expect(response.body.data.anyActive).toBe(false);
    expect(response.body.data.nextCursor).toBeNull();
  });

  it('paginates with cursor and limit', async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      tenantRow({ tenant_code: `T${index}` })
    );
    const { app, cookie } = api({ tenants: rows });
    const firstPage = await get(app, cookie, '?limit=2');
    expect(firstPage.body.data.rows).toHaveLength(2);
    expect(firstPage.body.data.nextCursor).not.toBeNull();

    const secondPage = await get(
      app,
      cookie,
      `?limit=2&cursor=${encodeURIComponent(firstPage.body.data.nextCursor)}`
    );
    expect(secondPage.body.data.rows).toHaveLength(1);
    expect(secondPage.body.data.nextCursor).toBeNull();
  });

  it("returns one client's tenants for clientId, and rejects a malformed one", async () => {
    const clientId = randomUUID();
    const mine = tenantRow({ tenant_code: 'MINE', client_id: clientId });
    const other = tenantRow({ tenant_code: 'OTHER', client_id: randomUUID() });
    const { app, cookie } = api({ tenants: [mine, other] });
    const response = await get(app, cookie, `?clientId=${clientId}`);
    expect(response.status).toBe(200);
    expect(response.body.data.rows).toEqual([
      { ...tenantView(mine), job: null },
    ]);
    expect(response.body.data.nextCursor).toBeNull();
    expect((await get(app, cookie, '?clientId=nope')).status).toBe(
      ERROR_STATUS.INVALID_INPUT
    );
  });

  it('rejects an out-of-range limit', async () => {
    const { app, cookie } = api();
    const response = await get(app, cookie, '?limit=0');
    expect(response.status).toBe(ERROR_STATUS.INVALID_INPUT);
  });
});
