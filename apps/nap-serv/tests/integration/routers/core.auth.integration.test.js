import request from 'supertest';
import app from '../../../src/app.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupAdminSchemaAndUser } from '../../util/testHelpers.js';

describe('Core Auth Router Integration (/api/v1/auth)', () => {
  let server;

  beforeAll(async () => {
    server = app.listen();
    await setupAdminSchemaAndUser();
  });

  afterAll(() => server.close());

  it('login -> me -> refresh -> logout', async () => {
    const login = await request(server).post('/api/v1/auth/login').send({ email: 'testuser@example.com', password: 'TestPassword123' });
    expect(login.status).toBe(200);
    const cookies = login.headers['set-cookie'];
    expect(cookies?.some((c) => c.includes('auth_token'))).toBe(true);
    expect(cookies?.some((c) => c.includes('refresh_token'))).toBe(true);

    const me = await request(server).get('/api/v1/auth/me').set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body?.user?.email).toBe('testuser@example.com');

    const refresh = await request(server).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(refresh.status).toBe(200);

    const logout = await request(server).post('/api/v1/auth/logout').set('Cookie', cookies);
    expect(logout.status).toBe(200);
  });
});
