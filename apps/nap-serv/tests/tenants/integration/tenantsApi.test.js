'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import request from 'supertest';
import { runExtendedCrudTests } from '../../util/runExtendedCrudTests.js';
import { db } from '../../../src/db/db.js';

const routePrefix = '/api/tenants/v1/tenants';

let server, teardown;
let tenantId;

export const cleanupTestDependencies = async () => {
  const all = await db.tenants.findAll();
  for (const row of all) await db.tenants.delete(row.id);
};

function extraTests(context) {
  let server;
  let tenant;

  beforeAll(async () => {
    server = context.server;
    tenant = await db.tenants.insert({
      name: 'Module Check Tenant',
      subdomain: 'modules-check',
      email: 'check@example.com',
      allowed_modules: ['tenants', 'projects'],
      db_host: 'localhost',
      is_active: true,
      created_by: 'integration-test',
    });
  });

  afterAll(async () => {
    await db.tenants.delete(tenant.id);
  });

  test('GET /api/v1/tenants/:id/modules - Retrieve allowed modules', async () => {
    const res = await request(server)
      .get(`${routePrefix}/${tenant.id}/modules`)
      .set('Cookie', [`auth_token=${context.authToken}`]);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.allowed_modules)).toBe(true);
    expect(res.body.allowed_modules).toContain('tenants');
    expect(res.body.allowed_modules).toContain('projects');
  });
}

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    name: 'Integration Test Tenant',
    subdomain: 'integration-tenant',
    email: 'tenant@example.com',
    phone: '1234567890',
    address: {
      street: '123 Test St',
      city: 'Testville',
      postal: '12345',
    },
    timezone: 'UTC',
    currency_code: 'USD',
    plan: 'standard',
    allowed_modules: ['tenants', 'billing'],
    db_host: 'localhost',
    is_active: true,
    created_by: 'integration-test',
  }),
  updateField: 'plan',
  updateValue: 'enterprise',
  afterHook: cleanupTestDependencies,
  captureId: id => {
    tenantId = id;
  },
  extraTests,
});
