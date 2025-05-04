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
  updateField = 'name',
}) {
  if (!routePrefix || !testRecord) {
    throw new Error('routePrefix and testRecord are required.');
  }

  describe(`Extended CRUD API Tests: ${routePrefix}`, () => {
    let server, teardown;
    const context = { server: null, createdId: null };

    const getTestRecord = typeof testRecord === 'function' ? testRecord : () => testRecord;

    beforeAll(async () => {
      ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
      context.server = server;

      try {
        if (typeof beforeHook === 'function') {
          await beforeHook(context);
        }
      } catch (err) {
        console.error('Error in beforeHook:', err);
        throw err;
      }
    });

    afterAll(async () => {
      try {
        if (typeof afterHook === 'function') {
          await afterHook(context);
        }
      } catch (err) {
        console.error('Error in afterHook:', err);
        throw err;
      }

      await teardown();
    });

    test(`POST ${routePrefix} should create`, async () => {
      const res = await request(server).post(routePrefix).send(getTestRecord());
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      context.createdId = res.body.id;
    });

    test(`GET ${routePrefix} should return list`, async () => {
      const res = await request(server).get(routePrefix);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test(`GET ${routePrefix}/:id should return specific item`, async () => {
      const res = await request(server).get(`${routePrefix}/${context.createdId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(context.createdId);
    });

    test(`PUT ${routePrefix}/:id should update`, async () => {
      const res = await request(server)
        .put(`${routePrefix}/${context.createdId}`)
        .send({
          ...getTestRecord(),
          [updateField]: 'Updated Name',
          updated_by: 'integration-test',
        });
      expect(res.status).toBe(200);
      expect(res.body[updateField]).toBe('Updated Name');
    });

    test(`DELETE ${routePrefix}/:id should delete`, async () => {
      const res = await request(server).delete(`${routePrefix}/${context.createdId}`);
      expect(res.status).toBe(204);
    });

    if (typeof extraTests === 'function') {
      describe('Extra tests', () => {
        extraTests(context);
      });
    }
  });
}
