/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { controlResponseSchema } from '@nap/shared';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import { hashPassword } from '../../src/util/password.js';

let test: Awaited<ReturnType<typeof authDatabase>>;
let rootCookie: string;
const auth = '/api/admin-tenancy/v1/auth';
const control = '/api/admin-tenancy/v1/control';

/** Does: Extracts the disposable session cookie. Called by: registry permission setup. */
function cookie(reply: { headers: Record<string, unknown> }) {
  const value = reply.headers['set-cookie'];
  if (!Array.isArray(value) || typeof value[0] !== 'string')
    throw new Error('Missing test cookie');
  return value[0].split(';')[0];
}

/** Does: Reads the bounded control overview as root. Called by: registry state assertions. */
async function overview() {
  const reply = await request(test.server)
    .get(control + '/overview')
    .set('Cookie', rootCookie);
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return controlResponseSchema.parse(reply.body).data;
}

beforeAll(async () => {
  test = await authDatabase();
  rootCookie = cookie(
    await request(test.server)
      .post(auth + '/login')
      .send({ email: authEnv.ROOT_EMAIL, password: authEnv.ROOT_PASSWORD })
  );
  await test.owner.none(
    'UPDATE admin.tenants SET cell_id=NULL,provisioned=false,rbac_ready=false WHERE id=$1',
    [test.root.tenantId]
  );
  await test.owner.none('DELETE FROM admin.cells');
}, 30000);

afterAll(async () => {
  await test?.cleanup();
}, 30000);

it('registers and edits cells from an empty registry within the registry permission boundary', async () => {
  expect((await overview()).cells).toEqual([]);

  const register = await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({ operation: 'cell', code: 'cell-1', name: 'Initial cell' });
  expect(register.status, JSON.stringify(register.body)).toBe(200);
  expect((await overview()).cells).toMatchObject([
    { code: 'cell-1', name: 'Initial cell', enabled: true },
  ]);

  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({
      operation: 'cell',
      code: 'cell-1',
      name: 'Disabled cell',
      enabled: false,
    })
    .expect(200);
  expect((await overview()).cells).toMatchObject([
    { code: 'cell-1', name: 'Disabled cell', enabled: false },
  ]);

  const email = 'registry-operator@nap.test';
  const password = 'registry-operator-password';
  const operator = await test.admin.db.portal_users.insert({
    email,
    password_hash: await hashPassword(password, test.config.password),
    status: 'active',
    must_change_password: false,
  });
  await test.admin.db.platform_roles.insert({
    portal_user_id: operator.id,
    role: 'support',
  });
  const policy = (await test.admin.db.support_policy.findOneBy({
    code: 'support',
  }))!;
  await test.admin.db.support_policy.update(policy.id, {
    permissions: JSON.stringify(['admin-tenancy::control::registry']),
  });
  const operatorCookie = cookie(
    await request(test.server)
      .post(auth + '/login')
      .send({ email, password })
  );

  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', operatorCookie)
    .send({
      operation: 'cell',
      code: 'cell-1',
      name: 'Enabled cell',
      enabled: true,
    })
    .expect(200);
  await request(test.server)
    .get(control + '/overview')
    .set('Cookie', operatorCookie)
    .expect(403);
  expect((await overview()).cells).toMatchObject([
    { code: 'cell-1', name: 'Enabled cell', enabled: true },
  ]);

  await test.admin.db.support_policy.update(policy.id, {
    permissions: JSON.stringify([]),
  });
  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', operatorCookie)
    .send({
      operation: 'cell',
      code: 'cell-1',
      name: 'Forbidden edit',
      enabled: false,
    })
    .expect(403);
  expect((await overview()).cells).toMatchObject([
    { code: 'cell-1', name: 'Enabled cell', enabled: true },
  ]);
});
