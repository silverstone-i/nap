/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import {
  controlCommandResponseSchema,
  controlResponseSchema,
} from '@nap/shared';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import { createCellProvisioning } from '../../src/services/cellProvisioning.js';
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
  test = await authDatabase(false);
  test.cells.setProvisioning(
    createCellProvisioning(test.admin, test.cells, {
      environment: 'DEV',
      env: {},
    })
  );
  rootCookie = cookie(
    await request(test.server)
      .post(auth + '/login')
      .send({
        email: authEnv.ROOT_EMAIL_TEST,
        password: authEnv.ROOT_PASSWORD_TEST,
      })
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

it('registers and deduplicates cell jobs within the registry permission boundary', async () => {
  expect((await overview()).cells).toEqual([]);

  const register = await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({ operation: 'cell', suffix: 'east' });
  expect(register.status, JSON.stringify(register.body)).toBe(200);
  const registeredCell = await test.admin.db.cells.findOneBy({
    database_name: 'nap_dev_cell_east',
  });
  expect(controlCommandResponseSchema.parse(register.body).data).toEqual({
    jobId: null,
    cell: { id: registeredCell?.id, stage: 'registered', status: 'queued' },
  });
  expect((await overview()).cells).toMatchObject([
    { database_name: 'nap_dev_cell_east', enabled: false, status: 'queued' },
  ]);

  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({
      operation: 'cell',
      suffix: 'east',
    })
    .expect(200);
  expect((await overview()).cells).toMatchObject([
    { database_name: 'nap_dev_cell_east', enabled: false, status: 'queued' },
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
      suffix: 'east',
    })
    .expect(200);
  await request(test.server)
    .get(control + '/overview')
    .set('Cookie', operatorCookie)
    .expect(403);
  expect((await overview()).cells).toMatchObject([
    { database_name: 'nap_dev_cell_east', enabled: false, status: 'queued' },
  ]);

  await test.admin.db.support_policy.update(policy.id, {
    permissions: JSON.stringify([]),
  });
  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', operatorCookie)
    .send({
      operation: 'cell',
      suffix: 'forbidden',
    })
    .expect(403);
  expect((await overview()).cells).toMatchObject([
    { database_name: 'nap_dev_cell_east', enabled: false, status: 'queued' },
  ]);
});

it('rejects client-selected environment and TEST management execution', async () => {
  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({ operation: 'cell', suffix: 'east', environment: 'PROD' })
    .expect(400);
  test.cells.setProvisioning(
    createCellProvisioning(test.admin, test.cells, {
      environment: 'TEST',
      env: {},
    })
  );
  await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({ operation: 'cell', suffix: 'test' })
    .expect(400);
  expect((await overview()).cells).toHaveLength(1);
});
