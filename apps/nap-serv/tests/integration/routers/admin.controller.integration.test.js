import request from 'supertest';
import app from '../../../src/app.js';
import { setupAdminSchemaAndUser, generateTestToken, setupAdditionalSchemasAndUsers } from '../../util/testHelpers.js';

describe('admin.controller integration', () => {
  let server;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
    await setupAdditionalSchemasAndUsers();
    process.env.TEST_SUPER_ADMIN_JWT = generateTestToken({ role: 'super_admin' });
    process.env.TEST_REGULAR_USER_JWT = generateTestToken({ role: 'admin' });
  });

  afterAll(() => {
    server.close();
  });

  test('GET /admin/schemas - should return all schema names', async () => {
    const res = await request(server)
      .get('/api/tenants/v1/admin/schemas')
      .set('Cookie', [`auth_token=${process.env.TEST_SUPER_ADMIN_JWT}`]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toContain('admin');
    expect(res.body).toContain('nap');
    expect(res.body).toContain('ciq');
  });

  test('GET /admin/switch-schema/:schema - should switch schema for super_admin', async () => {
    const res = await request(server)
      .post('/api/tenants/v1/admin/switch-schema/nap')
      .set('Cookie', [`auth_token=${process.env.TEST_SUPER_ADMIN_JWT}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Schema switched to nap' });
  });

  test('GET /admin/switch-schema/:schema - should reject non-super_admin', async () => {
    const res = await request(server)
      .post('/api/tenants/v1/admin/switch-schema/ciq')
      .set('Cookie', [`auth_token=${process.env.TEST_REGULAR_USER_JWT}`]);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
