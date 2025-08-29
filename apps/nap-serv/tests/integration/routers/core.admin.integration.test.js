import request from 'supertest';
import app from '../../../src/app.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupAdminSchemaAndUser } from '../../util/testHelpers.js';

describe('Core Admin Router Integration (/api/v1/admin)', () => {
  let server;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
  });

  afterAll(() => server.close());

  it('assume -> exit', async () => {
    const login = await request(server).post('/api/v1/auth/login').send({ email: 'testuser@example.com', password: 'TestPassword123' });
    const cookies = login.headers['set-cookie'];

    const assume = await request(server)
      .post('/api/v1/admin/assume-tenant')
      .set('Cookie', cookies)
      .send({ tenant_code: 'ADMIN', reason: 'test' });
    expect(assume.status).toBe(200);

    const exit = await request(server).post('/api/v1/admin/exit-assumption').set('Cookie', cookies);
    expect(exit.status).toBe(200);
  });
});
