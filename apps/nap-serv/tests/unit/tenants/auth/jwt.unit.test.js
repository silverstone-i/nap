import 'dotenv/config';
import { describe, it, expect, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { generateAccessToken, generateRefreshToken } from '../../../../modules/tenants/auth/jwt.js';

const user = {
  email: 'test@example.com',
  user_name: 'Test User',
  tenant_code: 'NAP',
  role: 'admin',
  schema_name: 'nap',
};

describe('jwt.js', () => {
  beforeAll(() => {});

  it('should generate a valid access token with expected payload', () => {
    const token = generateAccessToken(user);
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    expect(decoded).toMatchObject({
      email: user.email,
      user_name: user.user_name,
      tenant_code: user.tenant_code,
      role: user.role,
      schema_name: user.schema_name,
    });
  });

  it('should generate a valid refresh token with expected payload', () => {
    const token = generateRefreshToken(user);
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    expect(decoded).toMatchObject({
      email: user.email,
    });
  });
});
