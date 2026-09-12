/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import { seedReference } from '../../src/modules/reference-data/seed.js';
let test: Awaited<ReturnType<typeof authDatabase>>;
beforeAll(async () => {
  test = await authDatabase();
}, 30000);
afterAll(async () => {
  await test?.cleanup();
});
it('requires an authenticated operator and verifies the running pool physical identity and reference seed', async () => {
  const path =
    '/api/admin-tenancy/v1/control/cell-readiness?cell=' + test.cellId;
  expect((await request(test.app).get(path)).status).toBe(401);
  const agent = request.agent(test.app);
  const login = await agent.post('/api/admin-tenancy/v1/auth/login').send({
    email: authEnv.ROOT_EMAIL_TEST,
    password: authEnv.ROOT_PASSWORD_TEST,
  });
  expect(login.status).toBe(200);
  const owner = test.fixture.owner(test.fixture.cellUrl);
  await owner.none(
    `CREATE TABLE cell.physical_identity(singleton boolean PRIMARY KEY DEFAULT true,id uuid,environment text,database_name text,operation_id uuid);
 GRANT SELECT ON cell.physical_identity TO $1:name;
 GRANT USAGE ON SCHEMA reference TO $1:name;
 GRANT SELECT ON reference.countries,reference.currencies,reference.seed_versions TO $1:name`,
    [test.fixture.role]
  );
  await owner.none(
    'INSERT INTO cell.physical_identity(id,environment,database_name,operation_id) VALUES($1,$2,current_database(),$1)',
    [test.cellId, 'test']
  );
  await seedReference(owner);
  const response = await agent.get(path);
  expect(response.status, response.text).toBe(200);
  expect(JSON.parse(response.text)).toMatchObject({
    data: {
      cellId: test.cellId,
      environment: 'test',
      ready: true,
    },
  });
  await owner.none("UPDATE cell.physical_identity SET environment='prod'");
  expect((await agent.get(path)).status).toBe(503);
});
