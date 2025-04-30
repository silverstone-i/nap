

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

describe('Vendor API Integration Tests', () => {
  let server, teardown;
  let testVendorId;

  beforeAll(async () => {
    ({ server, teardown } = await setupIntegrationTest(['admin', 'public']));
  });

  afterAll(async () => {
    await teardown();
  });

  describe('POST /api/v1/vendors', () => {
    it('should create a new vendor', async () => {
      const newVendor = { name: 'Acme Corp', created_by: 'Tester' };
      const res = await request(server)
        .post('/api/v1/vendors')
        .send(newVendor);
      testVendorId = res.body.id;

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Acme Corp');
    });
  });

  test('GET /api/v1/vendors - return all vendors', async () => {
    const res = await request(server).get('/api/v1/vendors');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('PUT /api/v1/vendors/:id - update vendor', async () => {
    const res = await request(server)
      .put(`/api/v1/vendors/${testVendorId}`)
      .send({ name: 'Acme Corp Updated', updated_by: 'Tester' });
    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe('Acme Corp Updated');
  });

  test('DELETE /api/v1/vendors/:id - delete vendor', async () => {
    const res = await request(server).delete(`/api/v1/vendors/${testVendorId}`);
    expect(res.statusCode).toBe(204);
  });

  test('GET /api/v1/vendors/:id - confirm vendor deletion', async () => {
    const res = await request(server).get(`/api/v1/vendors/${testVendorId}`);
    expect(res.statusCode).toBe(404);
  });
});