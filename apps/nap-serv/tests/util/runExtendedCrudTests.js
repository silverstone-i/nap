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
import { setupIntegrationTest } from './integrationHarness.js';

export async function runExtendedCrudTests({
  routePrefix,
  testRecord,
  extraTests = () => {},
  beforeHook,
  afterHook,
}) {
  describe(`Extended CRUD API Tests: ${routePrefix}`, () => {
    let server, teardown;
    let createdId;

    beforeAll(async () => {
      ({ server, teardown } = await setupIntegrationTest());

      console.log('Running beforeHook', typeof beforeHook);

      if (typeof beforeHook === 'function') {
        console.log('Running beforeHook');

        await beforeHook({ server });
      }
    });

    afterAll(async () => {
      if (typeof afterHook === 'function') {
        await afterHook({ server });
      }
      await teardown();
    });

    test(`POST ${routePrefix} should create`, async () => {
      const res = await request(server).post(routePrefix).send(testRecord);
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      createdId = res.body.id;
    });

    test(`GET ${routePrefix} should return list`, async () => {
      const res = await request(server).get(routePrefix);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test(`GET ${routePrefix}/:id should return specific item`, async () => {
      const res = await request(server).get(`${routePrefix}/${createdId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdId);
    });

    test(`PUT ${routePrefix}/:id should update`, async () => {
      const res = await request(server)
        .put(`${routePrefix}/${createdId}`)
        .send({
          ...testRecord,
          name: 'Updated Name',
          updated_by: 'integration-test',
        });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
    });

    test(`DELETE ${routePrefix}/:id should delete`, async () => {
      const res = await request(server).delete(`${routePrefix}/${createdId}`);
      expect(res.status).toBe(204);
    });

    // Run any extra route tests
    test(`Extra tests for ${routePrefix}`, async () => {
      await extraTests({ server, createdId });
    });
  });
}
