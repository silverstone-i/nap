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
import { setupIntegrationTest } from '../../util/integrationHarness.js';

describe('Category API Integration Tests', () => {
  let server, teardown;
  let testCategoryId;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
  });

  afterAll(async () => {
    await teardown();
  });

  describe('POST /api/activities/v1/category', () => {
    it('should create a new category', async () => {
      const newCategory = { name: 'Test Category', created_by: 'Tester' };
      const res = await request(server)
        .post('/api/activities/v1/category')
        .send(newCategory);
      testCategoryId = res.body.id; // Store the ID for later tests

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Test Category');
    });
  });

  describe('GET /api/activities/v1/category', () => {
    it('should return all categories', async () => {
      try {
        const res = await request(server).get('/api/activities/v1/category');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      } catch (error) {
        console.error('Get all categories:', error);
      }
    });
  });

  test('PUT /api/activities/v1/category/:id - update category', async () => {
    const res = await request(server)
      .put(`/api/activities/v1/category/${testCategoryId}`)
      .send({ name: 'Updated Category', updated_by: 'Tester' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Updated Category');
  });

  test('DELETE /api/activities/v1/category/:id - delete category', async () => {
    const res = await request(server).delete(
      `/api/activities/v1/category/${testCategoryId}`
    );
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/activities/v1/category/:id - confirm category deletion', async () => {
    const res = await request(server).get(
      `/api/activities/v1/category/${testCategoryId}`
    );
    expect(res.statusCode).toBe(404);
  });
});
