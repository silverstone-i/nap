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
  OPTIONAL_MODULES,
  entitlementView,
  grantEntitlement,
  listEntitlements,
  withdrawEntitlement,
} from '../../src/modules/admin-tenancy/domain/entitlements.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };
const ROOT_ID = randomUUID();

describe('entitlementView', () => {
  it('reports an absent row as disabled with revision 0', () => {
    expect(entitlementView('sales', null)).toEqual({
      module: 'sales',
      enabled: false,
      revision: 0,
    });
  });

  it('projects an existing row', () => {
    expect(entitlementView('sales', { enabled: true, revision: 3 })).toEqual({
      module: 'sales',
      enabled: true,
      revision: 3,
    });
  });
});

/**
 * Build a tenant row shaped like `Tenants`' full row.
 * @param {object} [overrides]
 * @returns {object}
 */
function tenantRow(overrides = {}) {
  return {
    id: randomUUID(),
    tenant_code: 'ACME',
    name: 'Acme Construction',
    is_napsoft: false,
    deactivated_at: null,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle exercising only the HTTP layer: session
 * resolution, capability gating, and the response shape. Real advisory-lock
 * concurrency is verified against real PostgreSQL in the integration test.
 * @param {{tenants?: object[], entitlements?: object[], failInsertWith?: unknown, failUpdateWith?: unknown, failAdvanceWith?: unknown}} [seed]
 */
function fakeAdmin({
  tenants = [],
  entitlements = [],
  failInsertWith,
  failUpdateWith,
  failAdvanceWith,
} = {}) {
  const appended = [];
  const sessionStore = new Map();
  const tenantStore = new Map(tenants.map(row => [row.id, { ...row }]));
  const entitlementStore = new Map(
    entitlements.map(row => [`${row.tenant_id}:${row.module}`, { ...row }])
  );
  const eventStore = new Map();
  const revisions = new Map();
  const db = {
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
      findOneBy: async ({ id }) => {
        const found = tenantStore.get(id);
        return found ? { ...found } : null;
      },
    },
    module_entitlements: {
      findOneBy: async ({ tenant_id, module }) => {
        const found = entitlementStore.get(`${tenant_id}:${module}`);
        return found ? { ...found } : null;
      },
      findWhere: async ({ tenant_id }) =>
        [...entitlementStore.values()]
          .filter(row => row.tenant_id === tenant_id)
          .map(row => ({ ...row })),
      insert: async dto => {
        if (failInsertWith) throw failInsertWith;
        const row = { id: randomUUID(), ...dto };
        entitlementStore.set(`${row.tenant_id}:${row.module}`, row);
        return row;
      },
      update: async (id, dto) => {
        if (failUpdateWith) throw failUpdateWith;
        const existing = [...entitlementStore.values()].find(
          row => row.id === id
        );
        const updated = { ...existing, ...dto };
        entitlementStore.set(`${updated.tenant_id}:${updated.module}`, updated);
        return updated;
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
  return {
    db,
    appended,
    sessionStore,
    revisions,
    tenantStore,
    entitlementStore,
  };
}

/**
 * Build the API with a fake admin handle and the real route table, and a
 * live session cookie for a root or ordinary actor.
 * @param {object} [options]
 */
function api({
  tenants,
  entitlements,
  root = true,
  failInsertWith,
  failUpdateWith,
  failAdvanceWith,
} = {}) {
  const admin = fakeAdmin({
    tenants,
    entitlements,
    failInsertWith,
    failUpdateWith,
    failAdvanceWith,
  });
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

function get(app, cookie, path) {
  return request(app).get(path).set('Origin', ORIGIN).set('Cookie', cookie);
}

function put(app, cookie, path) {
  return request(app).put(path).set('Origin', ORIGIN).set('Cookie', cookie);
}

function del(app, cookie, path) {
  return request(app).delete(path).set('Origin', ORIGIN).set('Cookie', cookie);
}

describe('entitlements routes', () => {
  it('requires a session for read and write', async () => {
    const { app } = api();
    const tenantId = randomUUID();
    for (const response of [
      await request(app)
        .get(`/api/admin-tenancy/v1/tenants/${tenantId}/entitlements`)
        .set('Origin', ORIGIN),
      await request(app)
        .put(`/api/admin-tenancy/v1/tenants/${tenantId}/entitlements/sales`)
        .set('Origin', ORIGIN),
      await request(app)
        .delete(`/api/admin-tenancy/v1/tenants/${tenantId}/entitlements/sales`)
        .set('Origin', ORIGIN),
    ])
      expect(response.status).toBe(ERROR_STATUS.UNAUTHENTICATED);
  });

  it('refuses a session with no entitlements capability', async () => {
    const tenant = tenantRow();
    const { app, cookie } = api({ tenants: [tenant], root: false });
    const readResponse = await get(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements`
    );
    expect(readResponse.status).toBe(ERROR_STATUS.FORBIDDEN);
    const writeResponse = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(writeResponse.status).toBe(ERROR_STATUS.FORBIDDEN);
  });

  it('reports an unknown tenant as 404', async () => {
    const { app, cookie } = api();
    const response = await get(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${randomUUID()}/entitlements`
    );
    expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
  });

  it('reports an unknown or mandatory module as 404', async () => {
    const tenant = tenantRow();
    const { app, cookie } = api({ tenants: [tenant] });
    for (const module of ['not-a-real-module', 'reporting', 'access-control']) {
      const response = await put(
        app,
        cookie,
        `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/${module}`
      );
      expect(response.status).toBe(ERROR_STATUS.NOT_FOUND);
    }
  });

  it('returns the full catalogue with every module represented', async () => {
    const tenant = tenantRow();
    const { app, cookie } = api({
      tenants: [tenant],
      entitlements: [
        {
          id: randomUUID(),
          tenant_id: tenant.id,
          module: 'sales',
          enabled: true,
          revision: 2,
        },
      ],
    });
    const response = await get(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements`
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(OPTIONAL_MODULES.length);
    expect(response.body.data).toContainEqual({
      module: 'sales',
      enabled: true,
      revision: 2,
    });
    expect(response.body.data).toContainEqual({
      module: 'catalog',
      enabled: false,
      revision: 0,
    });
  });

  it('grants an absent module, creating a row at revision 1', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({ tenants: [tenant] });
    const response = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: true,
      revision: 1,
    });
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.granted',
      outcome: 'succeeded',
      tenant_id: tenant.id,
      details: {
        module_key: 'sales',
        from_enabled: false,
        to_enabled: true,
        revision: 1,
      },
    });
    expect(admin.revisions.get(`entitlement:${tenant.id}`)).toBe(1);
  });

  it('re-granting an already-enabled module is a no-op that still returns 200 without advancing the cache revision', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({
      tenants: [tenant],
      entitlements: [
        {
          id: randomUUID(),
          tenant_id: tenant.id,
          module: 'sales',
          enabled: true,
          revision: 5,
        },
      ],
    });
    const response = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: true,
      revision: 5,
    });
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.granted',
      outcome: 'succeeded',
      details: {
        module_key: 'sales',
        from_enabled: true,
        to_enabled: true,
        revision: 5,
      },
    });
    expect(admin.revisions.has(`entitlement:${tenant.id}`)).toBe(false);
  });

  it('granting a disabled module re-enables it and increments the revision', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({
      tenants: [tenant],
      entitlements: [
        {
          id: randomUUID(),
          tenant_id: tenant.id,
          module: 'sales',
          enabled: false,
          revision: 4,
        },
      ],
    });
    const response = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: true,
      revision: 5,
    });
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.granted',
      outcome: 'succeeded',
      details: {
        module_key: 'sales',
        from_enabled: false,
        to_enabled: true,
        revision: 5,
      },
    });
    expect(admin.revisions.get(`entitlement:${tenant.id}`)).toBe(1);
  });

  it('withdrawing an absent module creates no row and reports 200 disabled', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({ tenants: [tenant] });
    const response = await del(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: false,
      revision: 0,
    });
    expect(admin.entitlementStore.size).toBe(0);
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.withdrawn',
      outcome: 'succeeded',
      details: {
        module_key: 'sales',
        from_enabled: false,
        to_enabled: false,
        revision: 0,
      },
    });
    expect(admin.revisions.size).toBe(0);
  });

  it('re-withdrawing an already-disabled module is a no-op', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({
      tenants: [tenant],
      entitlements: [
        {
          id: randomUUID(),
          tenant_id: tenant.id,
          module: 'sales',
          enabled: false,
          revision: 2,
        },
      ],
    });
    const response = await del(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: false,
      revision: 2,
    });
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.withdrawn',
      outcome: 'succeeded',
      details: {
        module_key: 'sales',
        from_enabled: false,
        to_enabled: false,
        revision: 2,
      },
    });
    expect(admin.revisions.size).toBe(0);
  });

  it('withdrawing an enabled module disables it and increments the revision', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({
      tenants: [tenant],
      entitlements: [
        {
          id: randomUUID(),
          tenant_id: tenant.id,
          module: 'sales',
          enabled: true,
          revision: 1,
        },
      ],
    });
    const response = await del(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.body.data).toEqual({
      module: 'sales',
      enabled: false,
      revision: 2,
    });
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.withdrawn',
      outcome: 'succeeded',
      details: {
        module_key: 'sales',
        from_enabled: true,
        to_enabled: false,
        revision: 2,
      },
    });
    expect(admin.revisions.get(`entitlement:${tenant.id}`)).toBe(1);
  });

  it('surfaces an unavailable cache-revision store as 503, not 500, and still records a failed attempt', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({
      tenants: [tenant],
      failAdvanceWith: Object.assign(new Error('unavailable'), {
        code: 'SERVICE_UNAVAILABLE',
      }),
    });
    const response = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.status).toBe(ERROR_STATUS.SERVICE_UNAVAILABLE);
    // The failure-catch append, always last regardless of whether an
    // in-transaction "succeeded" event also landed in this fake (which,
    // unlike real Postgres, does not roll back writes on a thrown error).
    expect(admin.appended.at(-1)).toMatchObject({
      event_key: 'entitlement.granted',
      outcome: 'failed',
      tenant_id: tenant.id,
      details: { module_key: 'sales' },
    });
  });

  it('records the required failure event for a denied grant', async () => {
    const tenant = tenantRow();
    const { app, admin, cookie } = api({ tenants: [tenant], root: false });
    const response = await put(
      app,
      cookie,
      `/api/admin-tenancy/v1/tenants/${tenant.id}/entitlements/sales`
    );
    expect(response.status).toBe(ERROR_STATUS.FORBIDDEN);
    expect(admin.appended).toHaveLength(1);
    expect(admin.appended[0]).toMatchObject({
      event_key: 'entitlement.granted',
      outcome: 'denied',
    });
  });
});

describe('domain-level Napsoft denial', () => {
  // `authorization.js` currently resolves only root or no platform authority
  // (M0001-05's role-based `support` remains deferred), so there is no
  // runtime path today to authenticate as a support actor with a populated
  // `deniedTenantIds`. This exercises the domain layer directly with a
  // hand-built scope, mirroring `tests/integration/accounts.test.js`'s
  // `authority(deniedTenantIds)` helper.
  function scope(deniedTenantIds) {
    return {
      platformPortalUserRead: true,
      tenantIds: '*',
      deniedTenantIds,
      archiveManagement: true,
    };
  }

  it('reports FORBIDDEN, not NOT_FOUND, for a Napsoft-denied tenant', async () => {
    const napsoft = tenantRow({ is_napsoft: true });
    const { db } = fakeAdmin({ tenants: [napsoft] });
    const authority = { actorId: randomUUID(), scope: scope([napsoft.id]) };

    await expect(
      listEntitlements(db, authority, napsoft.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      grantEntitlement(db, authority, napsoft.id, 'sales')
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      withdrawEntitlement(db, authority, napsoft.id, 'sales')
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('still reports NOT_FOUND for a tenant that genuinely does not exist', async () => {
    const { db } = fakeAdmin();
    const authority = { actorId: randomUUID(), scope: scope([]) };
    await expect(
      listEntitlements(db, authority, randomUUID())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
