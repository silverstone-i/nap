/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { z } from 'zod';
import { ReadController } from '../../src/framework/ReadController.js';
import { createRouter } from '../../src/framework/createRouter.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { AdminRecords } from '../fixtures/adminRecord.js';
import { correlation } from '../../src/middleware/correlation.js';
import { sessionResolver } from '../../src/middleware/resolveSession.js';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { sessionResponseSchema, apiErrorSchema } from '@nap/shared';
import { randomUUID } from 'node:crypto';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import {
  bootstrapConfiguration,
  bootstrapRoot,
} from '../../src/services/bootstrap.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { adminModules } from '../../src/db/admin/modules.js';
import {
  signReference,
  readReference,
  sessionCookieName,
} from '../../src/util/sessionCookie.js';
import * as passwords from '../../src/util/password.js';
import { createApp } from '../../src/app.js';
import { Sessions } from '../../src/modules/admin-tenancy/models/Sessions.js';
import { resolveSession } from '../../src/services/sessions.js';
import { requestContext } from '../../src/util/requestContext.js';
import { logger } from '../../src/util/logger.js';

let test: Awaited<ReturnType<typeof authDatabase>>;
const base = '/api/admin-tenancy/v1/auth';
beforeAll(async () => {
  test = await authDatabase();
  vi.spyOn(logger, 'info').mockImplementation(() => {});
}, 30000);
afterAll(async () => {
  await test?.cleanup();
  vi.restoreAllMocks();
}, 30000);
beforeEach(async () => {
  await test.owner.none('TRUNCATE admin.sessions, admin.login_throttles');
});

/** Does: Submits a root login through the real middleware and router. */
function login(password = authEnv.ROOT_PASSWORD, email = authEnv.ROOT_EMAIL) {
  return request(test.server)
    .post(base + '/login')
    .send({ email, password });
}
/** Does: Extracts the response cookie without displaying its secret. */
function cookie(response: { headers: Record<string, unknown> }) {
  const value = response.headers['set-cookie'];
  if (!Array.isArray(value) || typeof value[0] !== 'string')
    throw new Error('Missing session cookie');
  return value[0].split(';')[0] ?? '';
}

it('replays migrations and bootstrap without changing rows or the password', async () => {
  const before = await test.admin.db.portal_users.findById(test.root.actorId);
  await migrateDatabase('admin', test.fixture.adminUrl, adminModules);
  expect(
    await bootstrapRoot(
      test.admin,
      bootstrapConfiguration(
        { ...authEnv, ROOT_PASSWORD: 'another-long-password' },
        []
      )
    )
  ).toEqual(test.root);
  const after = await test.admin.db.portal_users.findById(test.root.actorId);
  expect(after?.password_hash).toBe(before?.password_hash);
  expect(after?.created_by).toBeNull();
  expect(await test.admin.db.tenants.countAll()).toBe(1);
  expect(await test.admin.db.portal_user_tenants.countAll()).toBe(1);
});

it('logs in with normalized email and audited session, touches expiry, and logs out idempotently', async () => {
  const logged = await login(undefined, ' ROOT@NAP.TEST ');
  expect(logged.status).toBe(200);
  expect(sessionResponseSchema.parse(logged.body).data).toMatchObject({
    actorId: test.root.actorId,
    tenantId: test.root.tenantId,
    email: authEnv.ROOT_EMAIL,
    tenantCode: 'NAP',
  });
  expect(logged.headers['set-cookie'][0]).toMatch(/HttpOnly/);
  expect(logged.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
  const value = cookie(logged);
  const row = await test.admin.db.sessions.findOneBy({
    portal_user_id: test.root.actorId,
  });
  expect(row?.created_by).toBe(test.root.actorId);
  expect(row?.updated_by).toBe(test.root.actorId);
  expect(row?.token_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(value).not.toContain(row?.token_hash);
  const session = await request(test.server)
    .get(base + '/session')
    .set('Cookie', value);
  expect(session.status).toBe(200);
  expect(session.headers['cache-control']).toBe('no-store');
  expect(
    (
      await request(test.server)
        .post(base + '/logout')
        .set('Cookie', value)
    ).status
  ).toBe(200);
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', value)
    ).status
  ).toBe(401);
  expect(
    (
      await request(test.server)
        .post(base + '/logout')
        .set('Cookie', value)
    ).status
  ).toBe(200);
  expect((await request(test.server).post(base + '/logout')).status).toBe(200);
});

it('denies unknown and incorrect credentials alike while persisting anonymous throttle counters', async () => {
  const unknown = await login('wrong-password', 'unknown@nap.test');
  const wrong = await login('wrong-password');
  expect(unknown.status).toBe(401);
  expect(wrong.body).toEqual(unknown.body);
  const counters = await test.owner.any<{
    created_by: string | null;
    updated_by: string | null;
    key_hash: string;
  }>('SELECT * FROM admin.login_throttles');
  expect(counters).toHaveLength(3);
  expect(
    counters.every(row => row.created_by === null && row.updated_by === null)
  ).toBe(true);
  expect(counters.every(row => /^[a-f0-9]{64}$/.test(row.key_hash))).toBe(true);
});

it('counts concurrent failures, refuses before password evaluation, and releases expired keys', async () => {
  const replies = await Promise.all(
    Array.from({ length: 12 }, () => login('wrong-password'))
  );
  expect(replies.filter(reply => reply.status === 401)).toHaveLength(10);
  expect(replies.filter(reply => reply.status === 429)).toHaveLength(2);
  const verify = vi.spyOn(passwords, 'verifyPassword');
  expect(apiErrorSchema.parse((await login()).body).code).toBe('THROTTLED');
  expect(verify).not.toHaveBeenCalled();
  verify.mockRestore();
  const rows = await test.owner.any<{ failures: number }>(
    'SELECT failures FROM admin.login_throttles'
  );
  expect(rows.map(row => row.failures)).toEqual([10, 10]);
  await test.owner.none(
    "UPDATE admin.login_throttles SET window_started_at = now() - interval '31 minutes', locked_until = now() - interval '1 minute'"
  );
  expect((await login()).status).toBe(200);
});

it('clears only the email counter after successful login and retains the authenticated actor', async () => {
  await login('wrong-password');
  expect((await login()).status).toBe(200);
  const rows = await test.owner.any<{
    failures: number;
    updated_by: string | null;
  }>(
    'SELECT failures, updated_by FROM admin.login_throttles ORDER BY failures'
  );
  expect(rows.map(row => row.failures)).toEqual([0, 1]);
  expect(rows[0]?.updated_by).toBe(test.root.actorId);
});

it('denies locked identities and memberships, inactive tenants, and zero memberships; multiple bindings enter selection', async () => {
  const root = await test.admin.db.portal_users.findById(test.root.actorId);
  if (!root) throw new Error('Missing root');
  const user = await test.admin.db.portal_users.insert({
    email: 'member@nap.test',
    password_hash: root.password_hash,
    status: 'active',
    is_root: false,
  });
  const otherTenant = await test.admin.db.tenants.insert({
    tenant_code: 'OTHER',
    cell_id: (await test.admin.db.tenants.findById(test.root.tenantId))!
      .cell_id,
    provisioned: true,
    company: 'Other',
    status: 'active',
  });
  try {
    expect((await login(undefined, user.email)).status).toBe(401);
    const membership = await test.admin.db.portal_user_tenants.insert({
      portal_user_id: user.id,
      tenant_id: test.root.tenantId,
      ready: true,
      user_type: 'vendor',
      entity_id: randomUUID(),
      status: 'active',
    });
    expect((await login(undefined, user.email)).status).toBe(200);
    await test.admin.db.portal_users.update(user.id, { status: 'locked' });
    expect((await login(undefined, user.email)).status).toBe(401);
    await test.admin.db.portal_users.update(user.id, { status: 'active' });
    await test.admin.db.portal_user_tenants.update(membership.id, {
      status: 'locked',
    });
    expect((await login(undefined, user.email)).status).toBe(401);
    await test.admin.db.portal_user_tenants.update(membership.id, {
      status: 'active',
    });
    await test.admin.db.tenants.update(test.root.tenantId, {
      status: 'suspended',
    });
    expect((await login(undefined, user.email)).status).toBe(401);
    await test.admin.db.tenants.update(test.root.tenantId, {
      status: 'active',
    });
    await test.admin.db.portal_user_tenants.insert({
      portal_user_id: user.id,
      tenant_id: otherTenant.id,
      ready: true,
      user_type: 'vendor',
      entity_id: randomUUID(),
      status: 'active',
    });
    expect(
      sessionResponseSchema.parse((await login(undefined, user.email)).body)
        .data.state
    ).toBe('tenant-selection-required');
  } finally {
    await test.admin.db.tenants.update(test.root.tenantId, {
      status: 'active',
    });
    await test.owner.none(
      'DELETE FROM admin.sessions WHERE portal_user_id = $1; DELETE FROM admin.portal_user_tenants WHERE portal_user_id = $1',
      [user.id]
    );
    await test.owner.none('DELETE FROM admin.portal_users WHERE id = $1', [
      user.id,
    ]);
    await test.owner.none('DELETE FROM admin.tenants WHERE id = $1', [
      otherTenant.id,
    ]);
  }
});

it('checks cookie signature, identifier, secret, duplicates, and malformed encodings', async () => {
  const value = cookie(await login());
  const reference = await readReference(value, test.config.sessionSecret);
  if (!reference) throw new Error('Missing cookie reference');
  const cases = [
    value + 'x',
    sessionCookieName + '=%ZZ',
    value + '; ' + value,
    sessionCookieName +
      '=' +
      (await signReference(
        randomUUID(),
        reference.secret,
        test.config.sessionSecret
      )),
    sessionCookieName +
      '=' +
      (await signReference(
        reference.id,
        'f'.repeat(64),
        test.config.sessionSecret
      )),
  ];
  for (const invalid of cases)
    expect(
      (
        await request(test.server)
          .get(base + '/session')
          .set('Cookie', invalid)
      ).status
    ).toBe(401);
});

it.each(['idle_expires_at', 'absolute_expires_at', 'deactivated_at'])(
  'refuses a session after %s',
  async column => {
    const value = cookie(await login());
    await test.owner.none(
      "UPDATE admin.sessions SET $1:name = now() - interval '1 minute'",
      [column]
    );
    expect(
      (
        await request(test.server)
          .get(base + '/session')
          .set('Cookie', value)
      ).status
    ).toBe(401);
    expect(
      (
        await request(test.server)
          .post(base + '/logout')
          .set('Cookie', value)
      ).status
    ).toBe(200);
    const row = await test.owner.one<{ deactivated_at: Date | null }>(
      'SELECT deactivated_at FROM admin.sessions LIMIT 1'
    );
    expect(row.deactivated_at).not.toBeNull();
  }
);

it('revokes other sessions on password change and leaves the current cookie usable', async () => {
  const first = cookie(await login());
  const second = cookie(await login());
  expect(
    (
      await request(test.server)
        .put(base + '/password')
        .set('Cookie', first)
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'replacement-password',
        })
    ).status
  ).toBe(401);
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', second)
    ).status
  ).toBe(200);
  expect(
    (
      await request(test.server)
        .put(base + '/password')
        .set('Cookie', first)
        .send({
          currentPassword: authEnv.ROOT_PASSWORD,
          newPassword: 'replacement-password',
        })
    ).status
  ).toBe(200);
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', first)
    ).status
  ).toBe(200);
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', second)
    ).status
  ).toBe(401);
  expect((await login()).status).toBe(401);
  expect((await login('replacement-password')).status).toBe(200);
  await bootstrapRoot(
    test.admin,
    bootstrapConfiguration(authEnv, ['--reset-root-password'])
  );
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', first)
    ).status
  ).toBe(401);
  expect((await login()).status).toBe(200);
});

it.each([
  "email = 'other@nap.test'",
  "status = 'locked'",
  'is_root = false',
  'deactivated_at = now()',
])('guards root against %s', async assignment => {
  await expect(
    test.owner.none(
      'UPDATE admin.portal_users SET ' + assignment + ' WHERE id = $1',
      [test.root.actorId]
    )
  ).rejects.toMatchObject({ code: '23514' });
});

it('rejects tenant input on every auth route with a real session', async () => {
  const value = cookie(await login());
  for (const [method, path, body] of [
    [
      'post',
      '/login',
      { email: authEnv.ROOT_EMAIL, password: authEnv.ROOT_PASSWORD },
    ],
    ['post', '/logout', undefined],
    ['get', '/session', undefined],
    [
      'put',
      '/password',
      {
        currentPassword: authEnv.ROOT_PASSWORD,
        newPassword: 'replacement-password',
      },
    ],
  ] as const) {
    const response = await request(test.server)
      [method](base + path)
      .set('Cookie', value)
      .set('x-tenant-id', test.root.tenantId)
      .send(body);
    expect(response.status).toBe(400);
    expect(
      (
        await request(test.server)
          [method](base + path + '?tenant_id=' + test.root.tenantId)
          .set('Cookie', value)
          .send(body)
      ).status
    ).toBe(400);
  }
  expect(
    (
      await request(test.server)
        .post(base + '/login')
        .send({
          email: authEnv.ROOT_EMAIL,
          password: authEnv.ROOT_PASSWORD,
          tenant_id: test.root.tenantId,
        })
    ).status
  ).toBe(400);
});

it('enforces case-insensitive email uniqueness, root uniqueness, and root deletion guards', async () => {
  const root = await test.admin.db.portal_users.findById(test.root.actorId);
  if (!root) throw new Error('Missing root');
  await expect(
    test.owner.none(
      `INSERT INTO admin.portal_users (email, password_hash, status, is_root)
    VALUES ($1, $2, 'active', false)`,
      [root.email.toUpperCase(), root.password_hash]
    )
  ).rejects.toMatchObject({ code: '23505' });
  await expect(
    test.owner.none(
      `INSERT INTO admin.portal_users (email, password_hash, status, is_root)
    VALUES ('second-root@nap.test', $1, 'active', true)`,
      [root.password_hash]
    )
  ).rejects.toMatchObject({ code: '23505' });
  await expect(
    test.owner.none('DELETE FROM admin.portal_users WHERE id = $1', [root.id])
  ).rejects.toMatchObject({ code: '23514' });
});

it('rechecks locked membership and suspended tenant on the next cookie-bearing request', async () => {
  const value = cookie(await login());
  for (const [table, change, restore] of [
    ['tenants', "status = 'suspended'", "status = 'active'"],
  ]) {
    await test.owner.none('UPDATE admin.$1:name SET ' + change, [table]);
    try {
      expect(
        (
          await request(test.server)
            .get(base + '/session')
            .set('Cookie', value)
        ).status
      ).toBe(401);
    } finally {
      await test.owner.none('UPDATE admin.$1:name SET ' + restore, [table]);
    }
  }
});

it('does not extend idle expiry past absolute expiry and maintains database timestamps', async () => {
  const value = cookie(await login());
  await test.owner.none(
    "UPDATE admin.sessions SET absolute_expires_at = now() + interval '1 minute'"
  );
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', value)
    ).status
  ).toBe(200);
  const row = await test.owner.one<{
    idle_expires_at: Date;
    absolute_expires_at: Date;
    updated_by: string;
  }>('SELECT * FROM admin.sessions');
  expect(row.idle_expires_at).toEqual(row.absolute_expires_at);
  expect(row.updated_by).toBe(test.root.actorId);
  await request(test.server)
    .post(base + '/logout')
    .set('Cookie', value);
  const revoked = await test.owner.one<{
    updated_at: Date;
    deactivated_at: Date;
    updated_by: string;
  }>('SELECT * FROM admin.sessions');
  expect(revoked.updated_at).toEqual(revoked.deactivated_at);
  expect(revoked.updated_by).toBe(test.root.actorId);
});

it('ignores spoofed forwarding headers unless the configured proxy hop is trusted', async () => {
  for (let i = 0; i < 10; i++)
    await request(test.server)
      .post(base + '/login')
      .set('X-Forwarded-For', '192.0.2.' + i)
      .send({ email: 'unknown' + i + '@nap.test', password: 'wrong-password' });
  expect(
    (
      await request(test.server)
        .post(base + '/login')
        .set('X-Forwarded-For', '198.51.100.2')
        .send({ email: 'other@nap.test', password: 'wrong-password' })
    ).status
  ).toBe(429);
  const proxyApp = createApp(
    undefined,
    { admin: test.admin, cell: test.cell },
    { auth: test.config, trustProxyHops: 1 }
  );
  expect(
    (
      await request(proxyApp)
        .post(base + '/login')
        .set('X-Forwarded-For', '198.51.100.2')
        .send({ email: 'other@nap.test', password: 'wrong-password' })
    ).status
  ).toBe(401);
});

it('propagates database failures without treating them as an anonymous session', async () => {
  const value = cookie(await login());
  const transaction = vi
    .spyOn(test.admin, 'transaction')
    .mockRejectedValueOnce(new Error('database unavailable'));
  const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
  try {
    expect(
      (
        await request(test.server)
          .get(base + '/session')
          .set('Cookie', value)
      ).status
    ).toBe(500);
  } finally {
    transaction.mockRestore();
    error.mockRestore();
  }
});

it('rejects tenant headers, query, body, and parameters on a fixture framework route with a real session', async () => {
  const value = cookie(await login());
  const fixtureDb = createAdminDatabase(
    test.fixture.runtimeUrl(test.fixture.adminUrl),
    { repositories: { records: AdminRecords } }
  );
  const app = express();
  app.use(correlation, sessionResolver(test.admin, test.config), jsonBody);
  // This test-only entitlement lets rejection run after the ordinary framework gates.
  app.use((_request, response, next) => {
    if (response.locals.session)
      response.locals.session = {
        ...response.locals.session,
        entitlements: new Set(['fixture']),
        permissions: new Set([
          'fixture::records::probe',
          'fixture::records::tenant-probe',
        ]),
      };
    next();
  });
  const operation = vi.fn(() => Promise.resolve({ version: 1, data: null }));
  app.use(
    createRouter(new ReadController(fixtureDb, 'records'), {
      module: 'fixture',
      router: 'records',
      extend: add => {
        add({
          action: 'probe',
          method: 'post',
          path: '/probe',
          body: z.strictObject({}),
          query: z.strictObject({}),
          params: z.strictObject({}),
          response: z.unknown(),
          operation,
        });
      },
    })
  );
  app.use(errorHandler);
  try {
    for (const variation of ['header', 'query', 'body']) {
      let pending = request(app).post('/probe').set('Cookie', value);
      if (variation === 'header')
        pending = pending.set('x-tenant-id', test.root.tenantId);
      if (variation === 'query')
        pending = pending.query({ tenantId: test.root.tenantId });
      expect(
        (
          await pending.send(
            variation === 'body' ? { tenant_id: test.root.tenantId } : {}
          )
        ).status
      ).toBe(400);
    }
    expect(() =>
      createRouter(new ReadController(fixtureDb, 'records'), {
        module: 'fixture',
        router: 'records',
        extend: add =>
          add({
            action: 'tenant-probe',
            method: 'post',
            path: '/probe/:tenantId',
            body: z.strictObject({}),
            query: z.strictObject({}),
            params: z.strictObject({ tenantId: z.string() }),
            response: z.unknown(),
            operation,
          }),
      })
    ).toThrow('Extension path names a tenant');
    expect(operation).not.toHaveBeenCalled();
  } finally {
    await fixtureDb.close();
  }
});

it('grants only authentication runtime privileges and protects migration tracking', async () => {
  for (const [table, operation, allowed] of [
    ['sessions', 'DELETE', false],
    ['portal_users', 'DELETE', false],
    ['login_throttles', 'DELETE', true],
    ['sessions', 'INSERT', true],
    ['schema_migrations', 'INSERT', false],
  ] as const) {
    const result = await test.owner.one<{ allowed: boolean }>(
      'SELECT has_table_privilege($1, $2, $3) AS allowed',
      [test.fixture.role, 'admin.' + table, operation]
    );
    expect(result.allowed).toBe(allowed);
  }
});

it('produces the same authentication schema after staged migrations as on a fresh database', async () => {
  const url = await test.fixture.createDatabase('auth_upgrade');
  await migrateDatabase(
    'admin',
    url,
    adminModules.map(module => ({
      ...module,
      migrations: module.migrations.slice(0, 2),
    }))
  );
  await migrateDatabase('admin', url, adminModules);
  const upgraded = test.fixture.owner(url);
  for (const sql of [
    "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'admin' ORDER BY table_name, ordinal_position",
    "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'admin' ORDER BY tablename, indexname",
    "SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE trigger_schema = 'admin' ORDER BY event_object_table, trigger_name, event_manipulation",
  ])
    expect(await upgraded.any(sql)).toEqual(await test.owner.any(sql));
});

it('clears audit attribution when session extension rejects or throws', async () => {
  const signed = cookie(await login());
  const extend = vi.spyOn(Sessions.prototype, 'extend');
  try {
    await requestContext.run({ requestId: randomUUID() }, async () => {
      extend.mockResolvedValueOnce(null);
      expect(
        (await resolveSession(test.admin, signed, test.config))?.session
      ).toBeUndefined();
      expect(requestContext.getStore()?.actorId).toBeUndefined();
      extend.mockRejectedValueOnce(new Error('extension failed'));
      await expect(
        resolveSession(test.admin, signed, test.config)
      ).rejects.toThrow('extension failed');
      expect(requestContext.getStore()?.actorId).toBeUndefined();
    });
  } finally {
    extend.mockRestore();
  }
  await requestContext.run({ requestId: randomUUID() }, async () => {
    expect(
      (await resolveSession(test.admin, signed, test.config))?.session
    ).toBeDefined();
    expect(requestContext.getStore()?.actorId).toBe(test.root.actorId);
  });
});
