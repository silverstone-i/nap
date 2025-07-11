import express from 'express';
import request from 'supertest';
import adminApi from '../../../modules/tenants/apiRoutes/v1/admin.controller.router.js';

describe('adminApi contract test', () => {
  const app = express();
  app.use((req, res, next) => {
    req.user = { user_name: 'contract_test_user', role: 'super_admin' };
    req.schema = 'admin';
    next();
  });
  app.use(express.json());
  app.use('/api/tenants/v1/admin', adminApi);

  it('GET /schemas → 200 (array of schemas)', async () => {
    const res = await request(app).get('/api/tenants/v1/admin/schemas');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('POST /switch-schema/:schema → 200 (success message)', async () => {
    const res = await request(app).post('/api/tenants/v1/admin/switch-schema/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Schema switched to test' });
  });

  it('POST /switch-schema/:schema → 403 (for non-super_admin)', async () => {
    const appWithNonAdmin = express();
    appWithNonAdmin.use((req, res, next) => {
      req.user = { user_name: 'regular_user', role: 'admin' };
      req.schema = 'admin';
      next();
    });
    appWithNonAdmin.use(express.json());
    appWithNonAdmin.use('/api/tenants/v1/admin', adminApi);

    const res = await request(appWithNonAdmin).post('/api/tenants/v1/admin/switch-schema/test');
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Forbidden' });
  });
});
