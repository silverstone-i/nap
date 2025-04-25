'use strict';

/*
 * Integration tests for tenantApi.js
 */

import request from 'supertest';
import { setupIntegrationTest } from '../../../tests/util/integrationHarness.js';

let server;
let teardown;

beforeAll(async () => {
  const setup = await setupIntegrationTest(['admin']);
  server = setup.server;
  teardown = setup.teardown;
});

afterAll(async () => {
  await teardown();
});

describe('Tenant API Integration Tests', () => {
  let tenantId;

  test('POST /api/tenants/v1/ - Create tenant', async () => {
    const res = await request(server)
      .post('/api/tenants/v1/')
      .send({
        name: 'Test Tenant',
        email: 'test@example.com',
        address: {
          address: '123 Test St',
          street: 'Test St',
          city: 'Test City',
          postal: '12345',
        },
        allowed_modules: ['tenants'],
        created_by: 'system',
      });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.name).toBe('Test Tenant');
    tenantId = res.body.id;
  });

  test('GET /api/tenants/v1/ - Retrieve all tenants', async () => {
    const res = await request(server).get('/api/tenants/v1/');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/tenants/v1/:id - Retrieve tenant by ID', async () => {
    const res = await request(server).get(`/api/tenants/v1/${tenantId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', tenantId);
  });

  test('PUT /api/tenants/v1/:id - Update tenant by ID', async () => {
    const res = await request(server)
      .put(`/api/tenants/v1/${tenantId}`)
      .send({ name: 'Updated Tenant', allowed_modules: ['tenants', 'billing'], updated_by: 'Updated Tenant' });

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Updated Tenant');
  });

  test('GET /api/tenants/v1/:id/modules - Retrieve allowed modules', async () => {
    const res = await request(server).get(`/api/tenants/v1/${tenantId}/modules`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.allowed_modules)).toBe(true);
    expect(res.body.allowed_modules).toContain('tenants', 'billing');
  });

  test('DELETE /api/tenants/v1/:id - Delete tenant by ID', async () => {
    const res = await request(server).delete(`/api/tenants/v1/${tenantId}`);
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/tenants/v1/:id - Confirm tenant deletion', async () => {
    const res = await request(server).get(`/api/tenants/v1/${tenantId}`);
    expect(res.statusCode).toBe(404);
  });
});
