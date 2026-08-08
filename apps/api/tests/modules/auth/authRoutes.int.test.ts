/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../../src/app.js';
import { closeDb, getDb, initDb, migrateAdmin } from '../../../src/db/index.js';
import type { AppConfig } from '../../../src/util/appConfig.js';
import {
  hashPassword,
  OWASP_BASELINE,
} from '../../../src/util/passwordHash.js';

// This file owns the process's one initDb() call (singleton rule) and works
// on the shared admin schema, dropped before and after; the integration
// project runs files serially (vitest.config.ts) so the two int files never
// contend for it.
const url = process.env.DATABASE_URL_TEST;

const PASSWORD = 'a-fine-password';
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Slack for wall-clock drift between the server and assertions. */
const TOLERANCE_MS = 10_000;

const CONFIG: AppConfig = {
  accessTokenSecret: randomBytes(32),
  cookies: { secure: false, sameSite: 'lax' },
  argon2: OWASP_BASELINE,
};

interface SetCookie {
  value: string;
  raw: string;
}

function readSetCookies(res: Response): Map<string, SetCookie> {
  const header = res.headers['set-cookie'] ?? [];
  const list = Array.isArray(header) ? header : [header];
  const cookies = new Map<string, SetCookie>();
  for (const raw of list) {
    const pair = raw.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    cookies.set(pair.slice(0, eq), { value: pair.slice(eq + 1), raw });
  }
  return cookies;
}

function body(res: Response): Record<string, unknown> {
  return res.body as Record<string, unknown>;
}

describe.skipIf(!url)('auth routes (integration)', () => {
  if (!url) {
    console.log('DATABASE_URL_TEST not set; skipping auth integration');
    return;
  }

  let app: Express;
  let tenantAId: string;
  let tenantBId: string;
  let passwordHash: string;

  async function createUser(
    email: string,
    overrides: { password_hash?: string | null; status?: string } = {},
    bindings: { tenantId: string; lastUsedAt?: Date }[] = []
  ): Promise<string> {
    const db = getDb();
    const userType = bindings.length > 1 ? 'vendor_contact' : 'employee';
    const user = await db.portalUsers.insert({
      email,
      password_hash:
        overrides.password_hash === undefined
          ? passwordHash
          : overrides.password_hash,
      user_type: userType,
      status: overrides.status ?? 'active',
    });
    for (const binding of bindings) {
      const inserted = await db.portalUserTenants.insert({
        portal_user_id: user.id,
        tenant_id: binding.tenantId,
        user_type: userType,
        entity_id: randomUUID(),
        status: 'active',
      });
      if (binding.lastUsedAt !== undefined) {
        await db.portalUserTenants.updateWhere([{ id: inserted.id }], {
          last_used_at: binding.lastUsedAt,
        });
      }
    }
    return user.id;
  }

  function login(email: string, password = PASSWORD): request.Test {
    return request(app).post('/api/auth/v1/login').send({ email, password });
  }

  async function loginCookies(
    email: string
  ): Promise<{ access: string; refresh: string; res: Response }> {
    const res = await login(email);
    expect(res.status).toBe(200);
    const cookies = readSetCookies(res);
    return {
      access: cookies.get('nap_access')?.value ?? '',
      refresh: cookies.get('nap_refresh')?.value ?? '',
      res,
    };
  }

  function cookieHeader(access: string, refresh: string): string[] {
    return [`nap_access=${access}`, `nap_refresh=${refresh}`];
  }

  beforeAll(async () => {
    initDb(url);
    const db = getDb();
    await db.none('DROP SCHEMA IF EXISTS admin CASCADE');
    await db.none('CREATE SCHEMA admin');
    await migrateAdmin();

    passwordHash = await hashPassword(PASSWORD, OWASP_BASELINE);
    const tenantA = await db.tenants.insert({
      tenant_code: 'AAA',
      company: 'Tenant A',
      schema_name: 'aaa',
      status: 'active',
    });
    tenantAId = tenantA.id;
    const tenantB = await db.tenants.insert({
      tenant_code: 'BBB',
      company: 'Tenant B',
      schema_name: 'bbb',
      status: 'active',
      session_idle_min_minutes: 30,
      session_idle_max_minutes: 60,
      session_absolute_hours: 1,
    });
    tenantBId = tenantB.id;

    app = createApp(undefined, CONFIG);
  }, 30_000);

  afterAll(async () => {
    await getDb().none('DROP SCHEMA IF EXISTS admin CASCADE');
    closeDb();
  });

  it('gives unknown email, wrong password, and no credential one identical refusal', async () => {
    await createUser('null-hash@auth.test', { password_hash: null }, [
      { tenantId: tenantAId },
    ]);

    const refusals = [
      await login('unknown@auth.test'),
      await login('null-hash@auth.test'),
      await login('null-hash@auth.test', 'whatever'),
    ];
    await createUser('wrong-pw@auth.test', {}, [{ tenantId: tenantAId }]);
    refusals.push(await login('wrong-pw@auth.test', 'not-the-password'));

    for (const res of refusals) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual(refusals[0]?.body);
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('refuses a non-active user holding the correct password', async () => {
    await createUser('invited@auth.test', { status: 'invited' }, [
      { tenantId: tenantAId },
    ]);
    const res = await login('invited@auth.test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('refuses a user with no binding in an active tenant, identically', async () => {
    await createUser('unbound@auth.test');
    const res = await login('unbound@auth.test');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid credentials' });
  });

  it('logs in: two httpOnly cookies, bindings, active tenant, expiry pair', async () => {
    await createUser('employee@auth.test', {}, [{ tenantId: tenantAId }]);
    const res = await login('employee@auth.test');

    expect(res.status).toBe(200);
    const cookies = readSetCookies(res);
    const access = cookies.get('nap_access');
    const refresh = cookies.get('nap_refresh');
    expect(access?.raw).toContain('Path=/api');
    expect(access?.raw).toContain('HttpOnly');
    expect(refresh?.raw).toContain('Path=/api/auth/v1');
    expect(refresh?.raw).toContain('HttpOnly');

    expect(body(res).bindings).toEqual([
      { tenant_code: 'AAA', company: 'Tenant A' },
    ]);
    expect(body(res).active_tenant_code).toBe('AAA');

    const now = Date.now();
    const idle = Date.parse(body(res).idle_expires_at as string);
    const absolute = Date.parse(body(res).absolute_expires_at as string);
    expect(Math.abs(idle - (now + 30 * MINUTE_MS))).toBeLessThan(TOLERANCE_MS);
    expect(Math.abs(absolute - (now + 12 * HOUR_MS))).toBeLessThan(
      TOLERANCE_MS
    );
  });

  it('rotates on refresh; replaying the prior token revokes the session', async () => {
    await createUser('rotate@auth.test', {}, [{ tenantId: tenantAId }]);
    const first = await loginCookies('rotate@auth.test');

    const refreshed = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(first.access, first.refresh));
    expect(refreshed.status).toBe(200);
    expect(typeof body(refreshed).idle_expires_at).toBe('string');
    const rotated = readSetCookies(refreshed).get('nap_refresh')?.value ?? '';
    expect(rotated).not.toBe(first.refresh);

    // Replay of the pre-rotation token: theft evidence (ADR-0014).
    const replay = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(first.access, first.refresh));
    expect(replay.status).toBe(401);
    expect(replay.body).toEqual({ error: 'Invalid session' });

    // The revocation kills the current token too.
    const afterReplay = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(first.access, rotated));
    expect(afterReplay.status).toBe(401);
  });

  it('refuses refresh past the idle expiry', async () => {
    await createUser('idle@auth.test', {}, [{ tenantId: tenantAId }]);
    const { access, refresh } = await loginCookies('idle@auth.test');
    const sessionId = refresh.split('.')[0] ?? '';

    await getDb().none(
      "UPDATE admin.sessions SET idle_expires_at = now() - interval '1 minute' WHERE id = $1",
      [sessionId]
    );
    const res = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(access, refresh));
    expect(res.status).toBe(401);
  });

  it('refuses refresh past the absolute lifetime regardless of activity', async () => {
    await createUser('absolute@auth.test', {}, [{ tenantId: tenantAId }]);
    const { access, refresh } = await loginCookies('absolute@auth.test');
    const sessionId = refresh.split('.')[0] ?? '';

    // Idle expiry is fine; only the session's age exceeds the 12-hour cap.
    await getDb().none(
      "UPDATE admin.sessions SET created_at = now() - interval '13 hours' WHERE id = $1",
      [sessionId]
    );
    const res = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(access, refresh));
    expect(res.status).toBe(401);
  });

  it('applies the most restrictive policy across a vendor contact and clamps the choice', async () => {
    const vendorId = await createUser('vendor@auth.test', {}, [
      { tenantId: tenantAId, lastUsedAt: new Date(Date.now() - HOUR_MS) },
      { tenantId: tenantBId },
    ]);
    // Prefers 120, but tenant B caps the window at 60 and the lifetime at 1h.
    await getDb().portalUsers.updateWhere([{ id: vendorId }], {
      session_idle_minutes: 120,
    });

    const res = await login('vendor@auth.test');
    expect(res.status).toBe(200);
    expect(body(res).active_tenant_code).toBe('BBB');

    const now = Date.now();
    const idle = Date.parse(body(res).idle_expires_at as string);
    const absolute = Date.parse(body(res).absolute_expires_at as string);
    expect(Math.abs(idle - (now + 60 * MINUTE_MS))).toBeLessThan(TOLERANCE_MS);
    expect(Math.abs(absolute - (now + 1 * HOUR_MS))).toBeLessThan(TOLERANCE_MS);
  });

  it("switches tenant only within the caller's active bindings", async () => {
    const { access, refresh } = await loginCookies('vendor@auth.test');

    const switched = await request(app)
      .post('/api/auth/v1/switch-tenant')
      .set('Cookie', cookieHeader(access, refresh))
      .send({ tenant_code: 'AAA' });
    expect(switched.status).toBe(200);
    expect(switched.body).toEqual({ active_tenant_code: 'AAA' });

    // The switch touched last_used_at, so the next login lands there.
    const relogin = await login('vendor@auth.test');
    expect(body(relogin).active_tenant_code).toBe('AAA');

    const refused = await request(app)
      .post('/api/auth/v1/switch-tenant')
      .set('Cookie', cookieHeader(access, refresh))
      .send({ tenant_code: 'ZZZ' });
    expect(refused.status).toBe(403);
  });

  it('changes the password with the current one and revokes the other sessions', async () => {
    await createUser('pwchange@auth.test', {}, [{ tenantId: tenantAId }]);
    const kept = await loginCookies('pwchange@auth.test');
    const other = await loginCookies('pwchange@auth.test');

    const wrong = await request(app)
      .put('/api/auth/v1/password')
      .set('Cookie', cookieHeader(kept.access, kept.refresh))
      .send({ current_password: 'not-it', new_password: 'a-new-password' });
    expect(wrong.status).toBe(401);

    const changed = await request(app)
      .put('/api/auth/v1/password')
      .set('Cookie', cookieHeader(kept.access, kept.refresh))
      .send({ current_password: PASSWORD, new_password: 'a-new-password' });
    expect(changed.status).toBe(204);

    // The other session's next refresh is refused; the caller's survives.
    const revoked = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(other.access, other.refresh));
    expect(revoked.status).toBe(401);
    const survives = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(kept.access, kept.refresh));
    expect(survives.status).toBe(200);

    const newLogin = await login('pwchange@auth.test', 'a-new-password');
    expect(newLogin.status).toBe(200);
  });

  it('logs out: revokes the session and clears both cookies', async () => {
    await createUser('logout@auth.test', {}, [{ tenantId: tenantAId }]);
    const { access, refresh } = await loginCookies('logout@auth.test');

    const res = await request(app)
      .post('/api/auth/v1/logout')
      .set('Cookie', cookieHeader(access, refresh));
    expect(res.status).toBe(204);
    const cleared = readSetCookies(res);
    expect(cleared.get('nap_access')?.raw).toContain('Expires=');
    expect(cleared.get('nap_refresh')?.raw).toContain('Expires=');

    const afterLogout = await request(app)
      .post('/api/auth/v1/refresh')
      .set('Cookie', cookieHeader(access, refresh));
    expect(afterLogout.status).toBe(401);
  });

  it('stores a valid idle-window choice and rejects the rest', async () => {
    const userId = await createUser('idle-window@auth.test', {}, [
      { tenantId: tenantAId },
    ]);
    const { access, refresh } = await loginCookies('idle-window@auth.test');

    const invalid = await request(app)
      .put('/api/auth/v1/idle-window')
      .set('Cookie', cookieHeader(access, refresh))
      .send({ idle_minutes: 45 });
    expect(invalid.status).toBe(400);

    const valid = await request(app)
      .put('/api/auth/v1/idle-window')
      .set('Cookie', cookieHeader(access, refresh))
      .send({ idle_minutes: 90 });
    expect(valid.status).toBe(204);

    const user = await getDb().portalUsers.findById(userId);
    expect(user?.session_idle_minutes).toBe(90);
  });
});
