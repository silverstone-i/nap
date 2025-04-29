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

  test('POST /api/v1/tenants - Create tenant', async () => {
    const res = await request(server)
      .post('/api/v1/tenants/')
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

  test('GET /api/v1/tenants/ - Retrieve all tenants', async () => {
    const res = await request(server).get('/api/v1/tenants/');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/tenants/:id - Retrieve tenant by ID', async () => {
    const res = await request(server).get(`/api/v1/tenants/${tenantId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('id', tenantId);
  });

  test('PUT /api/v1/tenants/:id - Update tenant by ID', async () => {
    const res = await request(server)
      .put(`/api/v1/tenants/${tenantId}`)
      .send({ name: 'Updated Tenant', allowed_modules: ['tenants', 'billing'], updated_by: 'Updated Tenant' });

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Updated Tenant');
  });

  test('GET /api/v1/tenants/:id/modules - Retrieve allowed modules', async () => {
    const res = await request(server).get(`/api/v1/tenants/${tenantId}/modules`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.allowed_modules)).toBe(true);
    expect(res.body.allowed_modules).toContain('tenants', 'billing');
  });

  test('DELETE /api/v1/tenants/:id - Delete tenant by ID', async () => {
    const res = await request(server).delete(`/api/v1/tenants/${tenantId}`);
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/v1/tenants/:id - Confirm tenant deletion', async () => {
    const res = await request(server).get(`/api/v1/tenants/${tenantId}`);
    expect(res.statusCode).toBe(404);
  });
});
