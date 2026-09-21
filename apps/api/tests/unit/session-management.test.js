/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { sessionViewSchema } from '@nap/shared';
import { createApp } from '../../src/app.js';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';
import {
  createRouteRegistry,
  routePath,
} from '../../src/framework/routeRegistry.js';
import {
  ERROR_MESSAGE,
  ERROR_STATUS,
  errorEnvelope,
} from '../../src/framework/envelope.js';
import { readCookie } from '../../src/framework/cookies.js';
import { trustedOrigin } from '../../src/middleware/browserRequestProtection.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  MAX_ACTIVE_SESSIONS,
  TOUCH_INTERVAL_MINUTES,
  createSessionToken,
  hashSessionToken,
  isSessionPermitted,
  parseSessionAuthority,
  parseSessionPolicy,
  parseSessionToken,
  sessionView,
} from '../../src/modules/admin-tenancy/domain/session.js';

const ORIGIN = 'http://localhost:5173';
const policy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };

/**
 * Build a session row shaped like the model's joined projection.
 * @param {object} [overrides]
 * @returns {object}
 */
function row(overrides = {}) {
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
 * Build an in-memory admin handle that behaves like the session model.
 *
 * Only enough of PostgreSQL is reproduced to exercise the HTTP layer: token
 * lookup, rotation, archiving, and the event and revision writes. Expiry and
 * concurrency are decided by SQL in the real model, so they are verified in
 * the database integration test rather than here.
 * @param {object[]} rows Session rows, keyed on their token hash.
 * @param {{rootUserIds?: string[]}} [options]
 * @returns {{db: object, events: object[], revisions: object[]}}
 */
function fakeAdmin(rows, { rootUserIds = [] } = {}) {
  const events = [];
  const revisions = [];
  const store = new Map(rows.map(entry => [entry.token_hash, entry]));
  const byId = id => [...store.values()].find(entry => entry.id === id) ?? null;
  const db = {
    tx: operation => operation({}),
    managed_events: {
      append: async event => {
        events.push(event);
        return event;
      },
    },
    cache_revisions: {
      advance: async keys => {
        revisions.push(...keys);
        return keys;
      },
    },
    portal_users: {
      findOneBy: async ({ id }) => ({
        id,
        is_root: rootUserIds.includes(id),
      }),
    },
    sessions: {
      findByTokenHash: async hash => {
        const found = store.get(hash);
        return found && found.deactivated_at === null ? { ...found } : null;
      },
      findAnyById: async id => {
        const found = byId(id);
        return found ? { ...found } : null;
      },
      archiveById: async id => {
        const found = byId(id);
        if (!found || found.deactivated_at !== null) return null;
        found.deactivated_at = new Date();
        return {
          id: found.id,
          portal_user_id: found.portal_user_id,
          tenant_id: found.tenant_id,
        };
      },
      archiveByTokenHash: async hash => {
        const found = store.get(hash);
        if (!found || found.deactivated_at !== null) return null;
        found.deactivated_at = new Date();
        return {
          id: found.id,
          portal_user_id: found.portal_user_id,
          tenant_id: found.tenant_id,
        };
      },
      rotate: async (currentHash, nextHash) => {
        const found = store.get(currentHash);
        if (!found || found.deactivated_at !== null) return null;
        store.delete(currentHash);
        found.token_hash = nextHash;
        store.set(nextHash, found);
        return { ...found };
      },
      touch: async () => null,
      lockLiveForUser: async () => [],
      insertSession: async () => row(),
      archiveForUser: async () => [],
    },
  };
  return { db, events, revisions };
}

/**
 * Build the API with a fake admin handle and the real route table.
 * @param {object[]} rows
 * @param {{rootUserIds?: string[]}} [options]
 * @returns {{app: import('express').Express, admin: object}}
 */
function api(rows = [], options) {
  const admin = fakeAdmin(rows, options);
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

/**
 * Issue a token, store its session, and return both.
 * @param {object} [overrides]
 * @returns {{token: string, session: object}}
 */
function live(overrides = {}) {
  const token = createSessionToken();
  const session = row({
    token_hash: hashSessionToken(policy, token),
    ...overrides,
  });
  return { token, session };
}

/**
 * Read the session cookie from a response's `Set-Cookie` header.
 * @param {object} response Supertest response.
 * @returns {{value: string|undefined, attributes: string}|undefined}
 */
function sessionCookie(response) {
  const header = (response.headers['set-cookie'] ?? []).find(entry =>
    entry.startsWith('nap_session=')
  );
  if (!header) return undefined;
  return {
    value: readCookie(header.split(';')[0], 'nap_session'),
    attributes: header,
  };
}

describe('session tokens', () => {
  it('issues 256 bits of base64url randomness and never repeats', () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => createSessionToken())
    );
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes with the configured secret and rejects a malformed token', () => {
    const token = createSessionToken();
    const hash = hashSessionToken(policy, token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(policy, token)).toBe(hash);
    expect(
      hashSessionToken({ ...policy, secret: `${policy.secret}x` }, token)
    ).not.toBe(hash);
    expect(parseSessionToken(token)).toBe(token);
    for (const bad of [
      undefined,
      null,
      42,
      '',
      token.slice(0, 42),
      `${token}a`,
      `${token.slice(0, 42)}+`,
    ])
      expect(() => parseSessionToken(bad)).toThrow('UNAUTHENTICATED');
  });

  it('bounds the configured policy', () => {
    expect(parseSessionPolicy(policy)).toEqual(policy);
    for (const bad of [
      { ...policy, secret: 'too-short' },
      { ...policy, idleMinutes: 0 },
      { ...policy, absoluteHours: 0 },
      { ...policy, absoluteHours: 1000 },
      { ...policy, extra: true },
    ])
      expect(() => parseSessionPolicy(bad)).toThrow('INVALID_INPUT');
  });

  it("states the contract's fixed limits", () => {
    expect(MAX_ACTIVE_SESSIONS).toBe(10);
    expect(TOUCH_INTERVAL_MINUTES).toBe(5);
  });
});

describe('session view', () => {
  it('carries no credential and derives the restricted flag from the account', () => {
    const source = row({ must_change_password: true, token_hash: 'leak' });
    const view = sessionView(source);
    expect(Object.keys(view)).not.toContain('token_hash');
    expect(JSON.stringify(view)).not.toContain('leak');
    expect(view.restricted).toBe(true);
    expect(sessionView(row()).restricted).toBe(false);
    expect(sessionViewSchema.safeParse(view).success).toBe(true);
  });
});

describe('revocation authority', () => {
  const napsoft = randomUUID();
  const other = randomUUID();
  const platformAdmin = {
    platformPortalUserRead: true,
    tenantIds: '*',
    deniedTenantIds: [],
    archiveManagement: false,
  };
  const support = { ...platformAdmin, deniedTenantIds: [napsoft] };
  const singleTenant = { ...platformAdmin, tenantIds: [other] };

  it('lets support reach platform and non-Napsoft sessions but not Napsoft ones', () => {
    expect(isSessionPermitted(support, null)).toBe(true);
    expect(isSessionPermitted(support, other)).toBe(true);
    expect(isSessionPermitted(support, napsoft)).toBe(false);
    expect(isSessionPermitted(platformAdmin, napsoft)).toBe(true);
  });

  it('keeps a tenant-scoped authority away from platform sessions', () => {
    expect(isSessionPermitted(singleTenant, null)).toBe(false);
    expect(isSessionPermitted(singleTenant, other)).toBe(true);
  });

  it('validates the authority it is given', () => {
    const actorId = randomUUID();
    expect(parseSessionAuthority({ actorId })).toEqual({
      actorId,
      scope: null,
    });
    expect(parseSessionAuthority({ actorId, scope: support })).toEqual({
      actorId,
      scope: support,
    });
    for (const bad of [
      undefined,
      { actorId: 'not-a-uuid' },
      { actorId, scope: { tenantIds: '*' } },
      { actorId, extra: true },
    ])
      expect(() => parseSessionAuthority(bad)).toThrow('INVALID_INPUT');
  });
});

describe('error envelope', () => {
  it('maps every code to a status and a fixed message', () => {
    for (const code of Object.keys(ERROR_STATUS)) {
      const body = errorEnvelope(code);
      expect(body).toEqual({
        version: 1,
        error: { code, message: ERROR_MESSAGE[code] },
      });
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(errorEnvelope('MADE_UP').error.code).toBe('INTERNAL_ERROR');
  });
});

describe('route registry', () => {
  it('builds the documented mount path and refuses a bad registration', () => {
    const registry = createRouteRegistry();
    const entry = {
      module: 'admin-tenancy',
      router: 'session',
      version: 1,
      database: 'admin',
      factory: () => null,
    };
    expect(routePath(entry)).toBe('/api/admin-tenancy/v1/session');
    registry.register(entry);
    expect(registry.registrations()).toHaveLength(1);
    expect(() => registry.register(entry)).toThrow('Duplicate');
    for (const bad of [
      { ...entry, router: 'Session' },
      { ...entry, router: 'other', version: 0 },
      { ...entry, router: 'other', database: 'redis' },
      { ...entry, router: 'other', factory: 'nope' },
    ])
      expect(() => registry.register(bad)).toThrow();
  });

  it('skips a cell router when no cell registry is supplied', () => {
    const registry = createRouteRegistry();
    const factory = vi.fn(() => null);
    registry.register({
      module: 'admin-tenancy',
      router: 'session',
      version: 1,
      database: 'cell',
      factory,
    });
    registry.mount({ use: vi.fn() }, {});
    expect(factory).not.toHaveBeenCalled();
  });

  it('registers every documented admin-tenancy route', () => {
    expect(adminTenancyRoutesV1.map(routePath)).toEqual([
      '/api/admin-tenancy/v1/session',
      '/api/admin-tenancy/v1/sessions',
      '/api/admin-tenancy/v1/auth',
      '/api/admin-tenancy/v1/control',
    ]);
  });
});

describe('browser request protection', () => {
  it('normalizes and rejects application origins', () => {
    expect(trustedOrigin('http://localhost:5173')).toBe(ORIGIN);
    for (const bad of ['', 'localhost:5173', 'null', 'ftp://x.example'])
      expect(() => trustedOrigin(bad)).toThrow('Invalid application origin');
  });

  it('accepts a same-origin change and refuses every unproven one', async () => {
    const cases = [
      [{ Origin: ORIGIN }, 204],
      [{ Origin: 'http://localhost:5174' }, 403],
      [{ Origin: 'https://localhost:5173' }, 403],
      [{ Origin: 'null' }, 403],
      [{ Origin: 'not a url' }, 403],
      [{ Referer: `${ORIGIN}/login` }, 204],
      [{ Referer: 'http://evil.example/login' }, 403],
      [{ Referer: 'not a url' }, 403],
      [{}, 403],
    ];
    for (const [headers, status] of cases) {
      const { app } = api();
      const response = await request(app)
        .post('/api/admin-tenancy/v1/auth/logout')
        .set(headers);
      expect({ headers, status: response.status }).toEqual({
        headers,
        status,
      });
    }
  });

  it('ignores a forgiving Referer when Origin is present and wrong', async () => {
    const { app } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/auth/logout')
      .set('Origin', 'http://evil.example')
      .set('Referer', `${ORIGIN}/login`);
    expect(response.status).toBe(403);
    expect(response.body).toEqual(errorEnvelope('FORBIDDEN'));
  });

  it('leaves application state unchanged when it refuses', async () => {
    const { token, session } = live();
    const { app, admin } = api([session]);
    await request(app)
      .post('/api/admin-tenancy/v1/auth/logout')
      .set('Origin', 'http://evil.example')
      .set('Cookie', `nap_session=${token}`);
    expect(session.deactivated_at).toBeNull();
    expect(admin.events).toHaveLength(0);
  });

  it('does not guard reads', async () => {
    const { token, session } = live();
    const { app } = api([session]);
    const response = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
  });
});

describe('session routes', () => {
  it("returns the caller's own session and nothing else", async () => {
    const { token, session } = live();
    const { app } = api([session]);
    const response = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.id).toBe(session.id);
    expect(sessionViewSchema.safeParse(response.body.data).success).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(session.token_hash);
  });

  it('refuses a missing, malformed, or unknown cookie alike', async () => {
    const { app } = api();
    for (const cookie of [
      undefined,
      'nap_session=',
      'nap_session=short',
      `nap_session=${createSessionToken()}`,
    ]) {
      const call = request(app).get('/api/admin-tenancy/v1/session/current');
      if (cookie) call.set('Cookie', cookie);
      const response = await call;
      expect(response.status).toBe(401);
      expect(response.body).toEqual(errorEnvelope('UNAUTHENTICATED'));
    }
  });

  it('holds a restricted session to password change and logout', async () => {
    const { token, session } = live({ must_change_password: true });
    const { app } = api([session]);
    const blocked = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', `nap_session=${token}`);
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual(errorEnvelope('PASSWORD_CHANGE_REQUIRED'));

    const rotate = await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(rotate.status).toBe(403);

    const logout = await request(app)
      .post('/api/admin-tenancy/v1/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(logout.status).toBe(204);
  });

  it('rotates to a new cookie whose lifetime tracks absolute expiry', async () => {
    const { token, session } = live();
    const { app } = api([session]);
    const response = await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(response.status).toBe(200);
    const cookie = sessionCookie(response);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.value).not.toBe(token);
    expect(cookie.attributes).toContain('HttpOnly');
    expect(cookie.attributes).toContain('SameSite=Lax');
    expect(cookie.attributes).toContain('Path=/');
    expect(cookie.attributes).not.toContain('Secure');
    expect(cookie.attributes).not.toContain('Domain');
    const maxAge = Number(/Max-Age=(\d+)/.exec(cookie.attributes)[1]);
    const remaining =
      (session.absolute_expires_at.getTime() - Date.now()) / 1000;
    expect(maxAge).toBeLessThanOrEqual(Math.ceil(remaining));
    expect(session.token_hash).toBe(hashSessionToken(policy, cookie.value));
  });

  it('clears the cookie when the presented token has already been replaced', async () => {
    const { token, session } = live();
    const { app } = api([session]);
    await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    const replayed = await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(replayed.status).toBe(401);
    expect(sessionCookie(replayed).value).toBe('');
  });

  it('clears the cookie on logout even without one to revoke', async () => {
    const { app, admin } = api();
    const response = await request(app)
      .post('/api/admin-tenancy/v1/auth/logout')
      .set('Origin', ORIGIN);
    expect(response.status).toBe(204);
    expect(sessionCookie(response).value).toBe('');
    expect(admin.events).toHaveLength(0);
  });

  it('records one revocation for a logout and none for the repeat', async () => {
    const { token, session } = live();
    const { app, admin } = api([session]);
    for (const expected of [204, 204])
      expect(
        (
          await request(app)
            .post('/api/admin-tenancy/v1/auth/logout')
            .set('Origin', ORIGIN)
            .set('Cookie', `nap_session=${token}`)
        ).status
      ).toBe(expected);
    expect(admin.events).toHaveLength(1);
    expect(admin.events[0]).toMatchObject({
      event_key: 'session.revoked',
      outcome: 'succeeded',
      session_id: session.id,
      details: { code: 'logout' },
    });
    expect(admin.revisions).toEqual([
      { domain: 'session', entity: session.id },
    ]);
  });

  it("revokes the caller's own session and refuses another user's", async () => {
    const mine = live();
    const theirs = live();
    const { app } = api([mine.session, theirs.session]);
    const own = await request(app)
      .delete(`/api/admin-tenancy/v1/sessions/${mine.session.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${mine.token}`);
    expect(own.status).toBe(204);
    expect(sessionCookie(own).value).toBe('');
    expect(mine.session.deactivated_at).not.toBeNull();

    const repeat = await request(app)
      .delete(`/api/admin-tenancy/v1/sessions/${mine.session.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${theirs.token}`);
    expect(repeat.status).toBe(403);
    expect(theirs.session.deactivated_at).toBeNull();
  });

  it("lets an unrestricted root revoke another user's session", async () => {
    const root = live();
    const target = live();
    const { app } = api([root.session, target.session], {
      rootUserIds: [root.session.portal_user_id],
    });
    const response = await request(app)
      .delete(`/api/admin-tenancy/v1/sessions/${target.session.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${root.token}`);
    expect(response.status).toBe(204);
    expect(target.session.deactivated_at).not.toBeNull();
  });

  it('refuses an unknown session identifier the same way as a forbidden one', async () => {
    const { token, session } = live();
    const { app } = api([session]);
    const missing = await request(app)
      .delete(`/api/admin-tenancy/v1/sessions/${randomUUID()}`)
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(missing.status).toBe(403);
    expect(missing.body).toEqual(errorEnvelope('FORBIDDEN'));
    const malformed = await request(app)
      .delete('/api/admin-tenancy/v1/sessions/not-a-uuid')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`);
    expect(malformed.status).toBe(400);
  });

  it('refuses a body that is not JSON and a body that is not parseable', async () => {
    const { token, session } = live();
    const { app } = api([session]);
    const form = await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('a=1');
    expect(form.status).toBe(415);
    const broken = await request(app)
      .post('/api/admin-tenancy/v1/session/rotate')
      .set('Origin', ORIGIN)
      .set('Cookie', `nap_session=${token}`)
      .set('Content-Type', 'application/json')
      .send('{');
    expect(broken.status).toBe(400);
  });

  it('answers an unknown API path with the shared 404 envelope', async () => {
    const { app } = api();
    const response = await request(app).get('/api/admin-tenancy/v1/nothing');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('session configuration', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };

  it('defaults the documented lifetimes and cookie attributes', () => {
    const config = runtimeConfiguration(base);
    expect(config.session).toEqual({
      secret: base.SESSION_SECRET_TEST,
      idleMinutes: 30,
      absoluteHours: 12,
    });
    expect(config.cookie).toEqual({ secure: true, sameSite: 'lax' });
    expect(config.applicationOrigin).toBe(ORIGIN);
  });

  it('rejects SameSite=None, a weak secret, and an unusable origin', () => {
    for (const change of [
      { COOKIE_SAMESITE_TEST: 'none' },
      { COOKIE_SAMESITE_TEST: 'None' },
      { COOKIE_SAMESITE_TEST: 'yes' },
      { COOKIE_SECURE_TEST: 'maybe' },
      { SESSION_SECRET_TEST: 'short' },
      { SESSION_SECRET_TEST: '<test-session-secret>' },
      { SESSION_SECRET_TEST: undefined },
      { APP_ORIGIN_TEST: undefined },
      { APP_ORIGIN_TEST: 'localhost:5173' },
      { APP_ORIGIN_TEST: 'http://localhost:5173/app' },
      { SESSION_IDLE_MINUTES: '0' },
      { SESSION_ABSOLUTE_HOURS: '0' },
      { SESSION_IDLE_MINUTES: '120', SESSION_ABSOLUTE_HOURS: '1' },
    ])
      expect(() => runtimeConfiguration({ ...base, ...change })).toThrow(
        'INVALID_CONFIGURATION'
      );
  });

  it('refuses insecure production cookies and a plaintext production origin', () => {
    const production = {
      NODE_ENV: 'production',
      TRUST_PROXY_HOPS_PROD: '1',
      SESSION_SECRET_PROD: 'production-session-secret-of-ample-length',
      AUTH_THROTTLE_SECRET_PROD: 'production-throttle-secret-of-ample-length',
      APP_ORIGIN_PROD: 'https://app.example',
      ADMIN_DATABASE_PROD: JSON.stringify({
        endpoint: 'db.example/nap_prod_admin',
        appPassword: 'runtime-secret',
      }),
    };
    expect(runtimeConfiguration(production).cookie).toEqual({
      secure: true,
      sameSite: 'lax',
    });
    for (const change of [
      { COOKIE_SECURE_PROD: 'false' },
      { COOKIE_SAMESITE_PROD: 'none' },
      { APP_ORIGIN_PROD: 'http://app.example' },
    ])
      expect(() => runtimeConfiguration({ ...production, ...change })).toThrow(
        'INVALID_CONFIGURATION'
      );
  });
});
