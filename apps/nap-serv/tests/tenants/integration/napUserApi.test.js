'use strict';

import request from 'supertest';
import { setupIntegrationTest } from '../../util/integrationHarness.js';
import { db } from '../../../src/db/db.js';

describe('Integration: napUser API', () => {
  let server, teardown;
  let testUserId;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest());

    // Seed a tenant
    try {
      await db.none(
        `INSERT INTO admin.nap_users (email, password_hash) VALUES ('testuser@test.com', 'password123')`
      );
    } catch (err) {
      console.error('Error seeding nap_users table:', err);
    }
  });

  afterAll(async () => {
    await teardown();
  });

  test('POST /api/tenants/v1/users - create a user', async () => {
    let res;
    try {
      res = await request(server).post('/api/tenants/v1/users').send({
        email: 'testuser@example.com',
        password_hash: 'password123',
        first_name: 'Test',
        last_name: 'User',
        role: 'support',
        created_by: 'admin',
      });
    } catch (err) {
      console.error('Error creating user:', err);
    }

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty('id');
    testUserId = res.body.id;
    
  });

  test('GET /api/tenants/v1/users/:id - fetch created user', async () => {
    const res = await request(server).get(`/api/tenants/v1/users/${testUserId}`);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      id: testUserId,
      email: 'testuser@example.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'support',
      created_by: 'admin',
    });
  });

  test('PUT /api/tenants/v1/users/:id - update user', async () => {
    const res = await request(server)
      .put(`/api/tenants/v1/users/${testUserId}`)
      .send({ first_name: 'updateduser', updated_by: 'testuser' });

    expect(res.statusCode).toBe(200);
    expect(res.body.first_name).toBe('updateduser');
  });

  test('DELETE /api/tenants/v1/users/:id - delete user', async () => {
    const res = await request(server).delete(`/api/tenants/v1/users/${testUserId}`);
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/tenants/v1/users/:id - confirm user deletion', async () => {
    const res = await request(server).get(`/tenants/v1/users/${testUserId}`);
    expect(res.statusCode).toBe(404);
  });
});
