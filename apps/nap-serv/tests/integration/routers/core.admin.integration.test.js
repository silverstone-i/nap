import request from 'supertest';
import app from '../../../src/app.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupAdminSchemaAndUser, generateTestToken } from '../../util/testHelpers.js';

describe('Admin Router Integration (/api/tenants/v1/admin)', () => {
  let server;
  let superadminToken;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
    superadminToken = generateTestToken({ role: 'superadmin' });
  });

  afterAll(() => server.close());

  it('GET /schemas - should return list of schemas', async () => {
    const res = await request(server)
      .get('/api/tenants/v1/admin/schemas')
      .set('Cookie', [`auth_token=${superadminToken}`]);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('POST /switch-schema/:schema - should switch schema', async () => {
    const res = await request(server)
      .post('/api/tenants/v1/admin/switch-schema/test-schema')
      .set('Cookie', [`auth_token=${superadminToken}`]);
    expect(res.status).toBe(200);
  });
});
