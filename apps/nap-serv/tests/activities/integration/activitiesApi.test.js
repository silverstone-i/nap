'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { runExtendedCrudTests } from '../../util/runExtendedCrudTests.js';
import { db } from '../../../src/db/db.js';
import request from 'supertest';

let catid;

async function setup(context) {
  // Create a category for the test
  const category = {
    tenant_id: '00000000-0000-4000-a000-000000000001',
    category_id: 'CAT-1',
    name: 'Test Category',
    description: 'Test Category Description',
    created_by: 'integration-test',
  };

  const result = await db.categories.insert(category);
  catid = result.id;
}

async function cleanup() {
  // Delete the test category
  await db.categories.delete(catid);
}

function extraTests(context) {
  describe('Extra tests after DELETE', () => {
    let server;

    beforeAll(() => {
      server = context.server;
    });

    test('should return 404 when fetching deleted record', async () => {
      const res = await request(server).get(`/api/v1/activities/${context.createdId}`);
      expect(res.status).toBe(404);
    });

    test('should not list deleted record in GET all', async () => {
      const res = await request(server).get('/api/v1/activities');
      expect(res.status).toBe(200);
      const ids = res.body.map(item => item.activity_id);
      expect(ids).not.toContain(context.createdId);
    });
  });
}

await runExtendedCrudTests({
  routePrefix: '/api/v1/activities',
  model: db.activities,
  testRecord: {
    tenant_id: '00000000-0000-4000-a000-000000000001',
    activity_id: 'ACT-TEST',
    name: 'Test Activity',
    category_id: 'CAT-1',
    type: 'turnkey',
    created_by: 'integration-test',
  },
  beforeHook: setup,
  afterHook: cleanup,
  extraTests,
});
