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
  updateValue = 'Updated Name',
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
          [updateField]: updateValue,
          updated_by: 'integration-test',
        });
      if (typeof updateValue === 'number') {
        expect(parseFloat(res.body[updateField])).toBeCloseTo(updateValue);
      } else {
        expect(res.body[updateField]).toBe(updateValue);
      }
    });

    test(`DELETE ${routePrefix}/:id should delete`, async () => {
      const res = await request(server).delete(`${routePrefix}/${context.createdId}`);
      expect(res.status).toBe(204);
    });

    test(`GET ${routePrefix}/:id with nonexistent ID should return 404`, async () => {
      const res = await request(server).get(`${routePrefix}/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });

    test(`PUT ${routePrefix}/:id with nonexistent ID should return 404`, async () => {
      const res = await request(server)
        .put(`${routePrefix}/00000000-0000-0000-0000-000000000000`)
        .send({
          ...getTestRecord(),
          [updateField]: updateValue,
          updated_by: 'integration-test',
        });
      expect(res.status).toBe(404);
    });

    test(`DELETE ${routePrefix}/:id with nonexistent ID should return 404`, async () => {
      const res = await request(server).delete(`${routePrefix}/00000000-0000-0000-0000-000000000000`);
      expect(res.status).toBe(404);
    });

    if (typeof extraTests === 'function') {
      describe('Extra tests', () => {
        extraTests(context);
      });
    }
  });
}
