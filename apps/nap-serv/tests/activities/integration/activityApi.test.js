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

describe('Activity API Integration Tests', () => {
  let server, teardown;
  let testActivityId;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'public']));
  });

  afterAll(async () => {
    await teardown();
  });

  describe('POST /api/v1/activity', () => {
    it('should create a new activity', async () => {
      const newActivity = { name: 'Test Activity', created_by: 'Tester' };
      const res = await request(server)
        .post('/api/v1/activity')
        .send(newActivity);
      testActivityId = res.body.id; // Store the ID for later tests
      console.log('Created Activity ID:', testActivityId);

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Test Activity');
    });
  });

  it('should return all activities', async () => {
    const res = await request(server).get('/api/v1/activity');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PUT /api/v1/activity/:id - update activity', async () => {
    const res = await request(server)
      .put(`/api/v1/activity/${testActivityId}`)
      .send({ name: 'Updated Activity', updated_by: 'Tester' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Updated Activity');
  });

  test('DELETE /api/v1/activity/:id - delete activity', async () => {
    const res = await request(server).delete(
      `/api/v1/activity/${testActivityId}`
    );
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/v1/activity/:id - confirm activity deletion', async () => {
    const res = await request(server).get(`/api/v1/activity/${testActivityId}`);
    expect(res.statusCode).toBe(404);
  });
});
