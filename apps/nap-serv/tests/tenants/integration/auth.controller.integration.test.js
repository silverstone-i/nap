import request from 'supertest';
import bcrypt from 'bcrypt';
import db from '../../../src/db/db.js';
import { setupIntegrationTest } from '../../util/integrationHarness.js';
import jwt from 'jsonwebtoken';
import { expect } from 'vitest';

const testEmail = 'test@example.com';
const testPassword = 'Password123!';
const testTenant = 'admin';
const routePrefix = '/api/tenants/v1/auth';
let passwordHash;
let server, teardown;
const context = { server: null, createdId: null };

beforeAll(async () => {
  ({ server, teardown } = await setupIntegrationTest(['tenantid']));

  context.server = server;
  passwordHash = await bcrypt.hash(testPassword, 10);

  // Clear test user if she exists
  await db('napUsers', 'admin').deleteWhere({ email: testEmail });

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

describe('/auth/logout', () => {
  it('should clear auth and refresh cookies on logout', async () => {
    const agent = request.agent(server);

    // Login first to set cookies
    await agent
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: testPassword });

    const res = await agent.post(`${routePrefix}/logout`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/auth_token=;/),
        expect.stringMatching(/refresh_token=;/),
      ])
    );
  });
});

describe('/auth/register', () => {
  const newEmail = 'newuser@example.com';

  afterAll(async () => {
    await db.napUsers.deleteWhere({ email: newEmail });
  });

  it('should register a new user successfully', async () => {
    const agent = request.agent(server);
    await agent
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: testPassword });

    const res = await agent.post(`${routePrefix}/register`).send({
      email: newEmail,
      password: 'NewPass123!',
      user_name: 'New User',
      tenant_code: 'TEST',
      role: 'user',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/registered/i);
  });

  it('should fail to register with missing fields', async () => {
    const res = await request(server)
      .post(`${routePrefix}/register`)
      .send({ email: newEmail }); // incomplete

    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

describe('/auth/token expiry', () => {
  it('should reject access with expired auth_token', async () => {
    const expiredToken = jwt.sign(
      {
        email: testEmail,
        role: 'super_admin',
        tenant_code: 'TEST',
        schema: 'admin',
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '-1s' }
    );

    const res = await request(server)
      .get(`${routePrefix}/check`)
      .set('Cookie', [`auth_token=${expiredToken}`]);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/unauthorized/i);
  });

  it('should refresh session even if auth_token is missing, as long as refresh_token is valid', async () => {
    const agent = request.agent(server);

    // Step 1: Login to receive refresh_token
    await agent
      .post(`${routePrefix}/login`)
      .send({ email: testEmail, password: testPassword });

    // Step 2: Manually clear the auth_token (simulate expiration)
    agent.jar.setCookie('auth_token=; Max-Age=0', routePrefix);

    // Step 3: Call /auth/refresh with only the valid refresh_token
    const res = await agent.post(`${routePrefix}/refresh`);

    // Step 4: Assert new auth_token is issued
    expect(res.statusCode).toBe(200);
    expect(res.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('auth_token=')])
    );
  });
});
