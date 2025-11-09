'use strict';

// Tenants JWT utils: keep legacy payload shape for unit tests, independent of AUTH_MODE
import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export function generateAccessToken(user) {
  const payload = {
    email: user.email,
    user_name: user.user_name,
    tenant_code: user.tenant_code,
    role: user.role,
    schema_name: user.schema_name?.toLowerCase?.() || user.tenant_code?.toLowerCase?.() || null,
  };
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(user) {
  const payload = { email: user.email };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

export default { generateAccessToken, generateRefreshToken };
