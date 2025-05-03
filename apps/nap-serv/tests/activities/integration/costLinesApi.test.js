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

describe('Cost Line API Integration Tests', () => {
  let server, teardown;
  let testCostLineId;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
  });

  afterAll(async () => {
    await teardown();
  });

  describe('POST /api/v1/cl/', () => {
    
    it('should create a new cost line', async () => {
      const newCostLine = {
        type: 'Material',
        amount: 1000,
        created_by: 'Tester',
      };
      const res = await request(server)
        .post('/api/v1/cl/')
        .send(newCostLine);
      testCostLineId = res.body.id; // Store the ID for later tests

      expect(res.statusCode).toBe(201);
      expect(res.body.type).toBe('Material');
    });

    it('should return all cost lines including the newly created one', async () => {
      const res = await request(server).get('/api/v1/cl/');
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(cl => cl.id === testCostLineId)).toBe(true);
    });

    test('PUT /api/v1/cl/:id - update cost line', async () => {
      const res = await request(server)
        .put(`/api/v1/cl/${testCostLineId}`)
        .send({ type: 'Labor', updated_by: 'Tester' });
      expect(res.statusCode).toBe(200);
      expect(res.body.type).toBe('Labor');
    });

    test('DELETE /api/v1/cl/:id - delete cost line', async () => {
      const res = await request(server).delete(
        `/api/v1/cl/${testCostLineId}`
      );
      expect(res.statusCode).toBe(204);
    });

    test('GET /api/v1/cl/:id - confirm cost line deletion', async () => {
      const res = await request(server).get(
        `/api/v1/cl/${testCostLineId}`
      );
      expect(res.statusCode).toBe(404);
    });
  });
});
