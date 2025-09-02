import request from 'supertest';
import app from '../../../src/app.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupAdminSchemaAndUser, generateTestToken } from '../../util/testHelpers.js';

describe('Admin Router Integration (/api/tenants/v1/admin)', () => {
  let server;
  let super_adminToken;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
    super_adminToken = generateTestToken({ role: 'super_admin' });
  });

  afterAll(() => server.close());

  it('GET /schemas - should return list of schemas', async () => {
    const res = await request(server)
      .get('/api/tenants/v1/admin/schemas')
      .set('Cookie', [`auth_token=${super_adminToken}`]);
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it('POST /switch-schema/:schema - should switch schema', async () => {
    const res = await request(server)
      .post('/api/tenants/v1/admin/switch-schema/test-schema')
      .set('Cookie', [`auth_token=${super_adminToken}`]);
    expect(res.status).toBe(200);
  });
});
