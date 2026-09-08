/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import { apiErrorSchema, successResponseSchema } from '@nap/shared';
import { correlation } from '../../src/middleware/correlation.js';
import { requestLogging } from '../../src/middleware/requestLogging.js';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { HttpError } from '../../src/util/httpError.js';
import { logger } from '../../src/util/logger.js';
import {
  createRouter,
  standardActions,
} from '../../src/framework/createRouter.js';
import { WriteController } from '../../src/framework/WriteController.js';
import { adminDatabase } from '../fixtures/adminDatabase.js';
import { withSession } from '../fixtures/testSession.js';
import type { AdminDatabase } from '../../src/db/admin/index.js';
import type { ResolvedSession } from '../../src/middleware/session.js';
import type { AdminRecords } from '../fixtures/adminRecord.js';

type Repos = { records: AdminRecords };
let context: Awaited<ReturnType<typeof adminDatabase>>;
const actor = randomUUID();
const authPath = '/api/admin-tenancy/v1/auth';
const recordSchema = z.object({
  id: z.guid(),
  code: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  deactivated_at: z.string().nullable(),
});
const singleSchema = successResponseSchema(recordSchema);
const loginSchema = successResponseSchema(
  z.strictObject({
    tenantSetting: z.string().nullable(),
    anonymous: z.boolean(),
    address: z.string().nullable(),
  })
);
const sessionSchema = successResponseSchema(
  z.strictObject({ actorId: z.string(), tenant: z.string().nullable() })
);

/** Does: A writable controller over the admin test table, bound to admin. */
class AuthController extends WriteController<'records', Repos> {
  constructor(db: AdminDatabase<Repos>) {
    super(db, 'records');
    this.rbacConfig = { module: 'admin-tenancy', router: 'auth' };
  }
}

/** Does: Builds a session holding every standard permission of the router. */
function fullSession(tenantId?: string): ResolvedSession {
  return {
    actorId: actor,
    ...(tenantId === undefined ? {} : { tenantId }),
    entitlements: new Set(['admin-tenancy']),
    permissions: new Set(
      standardActions.map(action => `admin-tenancy::auth::${action}`)
    ),
  };
}

/**
 * Does: Builds the admin-bound test app: the production chain, a session
 * stand-in, and the auth router with an anonymous login-like route and an
 * authenticated session route beside the standard set.
 */
function appFor(session?: ResolvedSession, trustProxyHops = 0) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxyHops);
  app.use(correlation, requestLogging, jsonBody, withSession(session));
  app.use(
    authPath,
    createRouter(new AuthController(context.db), {
      module: 'admin-tenancy',
      router: 'auth',
      extend: add => {
        add({
          action: 'login',
          method: 'post',
          path: '/login',
          access: 'anonymous',
          body: z.strictObject({
            code: z.string(),
            fail: z.boolean(),
            malformed: z.boolean().optional(),
          }),
          query: z.strictObject({}),
          params: z.strictObject({}),
          response: loginSchema,
          operation: async (tx, input) => {
            await tx.records.insert({ code: input.body.code, name: 'login' });
            const setting = await tx.one<{ value: string | null }>(
              "SELECT current_setting('nap.tenant_id', true) AS value"
            );
            input.reply.setCookie('nap_session', input.body.code, {
              httpOnly: true,
            });
            if (input.body.fail) throw new HttpError('UNAUTHENTICATED');
            if (input.body.malformed) return { version: 1, data: 'bad' };
            return {
              version: 1,
              data: {
                tenantSetting: setting.value,
                anonymous: input.session === undefined,
                address: input.clientAddress ?? null,
              },
            };
          },
        });
        add({
          action: 'session',
          method: 'get',
          path: '/session',
          access: 'authenticated',
          body: z.undefined(),
          query: z.strictObject({}),
          params: z.strictObject({}),
          response: sessionSchema,
          operation: (_tx, input) =>
            Promise.resolve({
              version: 1,
              data: {
                actorId: input.session.actorId,
                tenant: input.session.tenantId ?? null,
              },
            }),
        });
      },
    })
  );
  app.use((_request, _response, next) => next(new HttpError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}

/** Does: Parses a refusal and returns its code and field-error keys. */
function refusal(body: unknown) {
  const parsed = apiErrorSchema.parse(body);
  return { code: parsed.code, keys: Object.keys(parsed.fieldErrors ?? {}) };
}

/** Does: Counts the rows of the admin test table straight from the database. */
async function rowCount() {
  const row = await context.owner.one<{ count: number }>(
    'SELECT count(*)::int AS count FROM admin.framework_admin_record'
  );
  return row.count;
}

beforeAll(async () => {
  context = await adminDatabase();
}, 60000);
afterAll(async () => {
  await context.cleanup();
}, 30000);
beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await context.owner.none('DELETE FROM admin.framework_admin_record');
});

it('runs the standard routes on the admin pool with no tenant context', async () => {
  const app = appFor(fullSession(randomUUID()));
  const created = await request(app)
    .post(authPath)
    .send({ code: 'a1', name: 'Alpha', quantity: 3 });
  expect(created.status).toBe(201);
  const record = singleSchema.parse(created.body).data;
  expect(created.body).not.toHaveProperty('data.tenant_id');
  expect(record).toMatchObject({ code: 'a1', name: 'Alpha', quantity: 3 });
  const read = await request(app).get(`${authPath}/${record.id}`);
  expect(read.status).toBe(200);
  const listed = await request(app).get(authPath);
  expect(listed.status).toBe(200);
  expect(listed.body).toMatchObject({ page: { total: 1 } });
  const updated = await request(app)
    .put(`${authPath}/update`)
    .send({ ids: [record.id], changes: { name: 'Beta' } });
  expect(updated.status).toBe(200);
  expect(updated.body).toMatchObject({ data: [{ name: 'Beta' }] });
  const archived = await request(app)
    .delete(`${authPath}/archive`)
    .send({ ids: [record.id] });
  expect(archived.status).toBe(200);
  expect((await request(app).get(`${authPath}/${record.id}`)).status).toBe(404);
  const restored = await request(app)
    .patch(`${authPath}/restore`)
    .send({ ids: [record.id] });
  expect(restored.status).toBe(200);
  const withTenant = await request(app)
    .post(authPath)
    .send({ code: 'a2', name: 'Gamma', tenant_id: randomUUID() });
  expect(withTenant.status).toBe(400);
  expect(refusal(withTenant.body)).toEqual({
    code: 'INVALID_INPUT',
    keys: ['tenant_id'],
  });
  expect(await rowCount()).toBe(1);
});

it('answers an anonymous route without a session, applies its cookie only on success, and still refuses tenant input', async () => {
  const app = appFor();
  const ok = await request(app)
    .post(`${authPath}/login`)
    .send({ code: 'l1', fail: false });
  expect(ok.status).toBe(200);
  expect(loginSchema.parse(ok.body).data).toMatchObject({
    tenantSetting: null,
    anonymous: true,
  });
  expect(ok.headers['set-cookie']?.[0]).toMatch(/^nap_session=l1; .*HttpOnly/);
  expect(await rowCount()).toBe(1);
  const failed = await request(app)
    .post(`${authPath}/login`)
    .send({ code: 'l2', fail: true });
  expect(failed.status).toBe(401);
  expect(refusal(failed.body)).toEqual({ code: 'UNAUTHENTICATED', keys: [] });
  expect(failed.headers['set-cookie']).toBeUndefined();
  expect(await rowCount()).toBe(1);
  const malformed = await request(app)
    .post(`${authPath}/login`)
    .send({ code: 'l5', fail: false, malformed: true });
  expect(malformed.status).toBe(500);
  expect(refusal(malformed.body)).toEqual({ code: 'INTERNAL_ERROR', keys: [] });
  expect(malformed.headers['set-cookie']).toBeUndefined();
  const tenantInput = await request(app)
    .post(`${authPath}/login`)
    .set('X-Tenant-Id', randomUUID())
    .send({ code: 'l3', fail: false });
  expect(tenantInput.status).toBe(400);
  expect(refusal(tenantInput.body)).toEqual({
    code: 'INVALID_INPUT',
    keys: ['headers.x-tenant-id'],
  });
  const withSession = await request(appFor(fullSession()))
    .post(`${authPath}/login`)
    .send({ code: 'l4', fail: false });
  expect(loginSchema.parse(withSession.body).data.anonymous).toBe(false);
});

it('answers an authenticated route with any session and refuses without one', async () => {
  const none = await request(appFor()).get(`${authPath}/session`);
  expect(none.status).toBe(401);
  expect(refusal(none.body)).toEqual({ code: 'UNAUTHENTICATED', keys: [] });
  const bare: ResolvedSession = {
    actorId: actor,
    entitlements: new Set(),
    permissions: new Set(),
  };
  const tenantless = await request(appFor(bare)).get(`${authPath}/session`);
  expect(tenantless.status).toBe(200);
  expect(sessionSchema.parse(tenantless.body).data).toEqual({
    actorId: actor,
    tenant: null,
  });
  const tenantId = randomUUID();
  const withTenant = await request(appFor(fullSession(tenantId))).get(
    `${authPath}/session`
  );
  expect(sessionSchema.parse(withTenant.body).data.tenant).toBe(tenantId);
  const standard = await request(appFor(bare)).get(authPath);
  expect(standard.status).toBe(403);
});

it('reports the socket address unless the app trusts proxy hops', async () => {
  const forwarded = '203.0.113.9';
  const direct = await request(appFor())
    .post(`${authPath}/login`)
    .set('X-Forwarded-For', forwarded)
    .send({ code: 'p1', fail: false });
  expect(loginSchema.parse(direct.body).data.address).not.toBe(forwarded);
  const trusted = await request(appFor(undefined, 1))
    .post(`${authPath}/login`)
    .set('X-Forwarded-For', forwarded)
    .send({ code: 'p2', fail: false });
  expect(loginSchema.parse(trusted.body).data.address).toBe(forwarded);
});
