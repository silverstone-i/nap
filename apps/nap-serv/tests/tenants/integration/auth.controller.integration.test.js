import request from 'supertest';
import bcrypt from 'bcrypt';
import db from '../../../src/db/db.js';
import { setupIntegrationTest } from '../../util/integrationHarness.js';

const testEmail = 'test@example.com';
const testPassword = 'Password123!';
const testTenant = 'admin';
const routePrefix = '/api/tenants/v1/auth';
let passwordHash;
let server, teardown;
const context = { server: null, createdId: null };

beforeAll(async () => {
  ({ server, teardown } = await setupIntegrationTest(['admin', 'tenantid']));
  context.server = server;
  passwordHash = await bcrypt.hash(testPassword, 10);

  // Clear test user if it exists
  // await db('napUsers', 'admin').deleteWhere({ email: testEmail });

  // Insert test user
  try {
    await db.napUsers.insert({
      email: testEmail,
      user_name: 'Test User',
      password_hash: passwordHash,
      tenant_code: 'TEST',
      role: 'super_admin',
    });
  } catch (err) {
    console.error('Error inserting test user:', err);
  }
});

afterAll(async () => {
  await teardown();
  // await db(NapUsersModel, testTenant).deleteWhere({ email: testEmail });
});

describe('/auth/login', () => {
  it('should login successfully and return auth/refresh cookies', async () => {
    const res = await request(server)
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: testPassword });

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('auth_token='),
        expect.stringContaining('refresh_token='),
      ])
    );
  });

  it('should fail with invalid password', async () => {
    const res = await request(server)
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: 'wrongPassword' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/incorrect/i);
  });

  it('should fail with unknown email', async () => {
    const res = await request(server)
      .post(`${routePrefix}/login`)
      .send({ email: 'unknown@example.com', password: testPassword });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/incorrect/i);
  });
});

describe('/auth/refresh', () => {
  it('should issue a new access token if refresh token is valid', async () => {
    const agent = request.agent(server);

    // Login first to set refresh cookie
    await agent
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: testPassword });

    // Call refresh endpoint
    const res = await agent.post(`${routePrefix}/refresh`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('auth_token=')])
    );
  });

  it('should fail if refresh token is missing', async () => {
    const res = await request(server).post(`${routePrefix}/refresh`);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/refresh token/i);
  });
});
