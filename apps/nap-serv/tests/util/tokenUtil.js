import jwt from 'jsonwebtoken';

export function generateTestToken(payload = {}) {
  const defaultPayload = {
    email: 'test@nap.com',
    user_name: 'test',
    tenant_code: 'tenantid',
    role: 'admin',
  };

  const secret = process.env.ACCESS_TOKEN_SECRET || 'test-secret';
  return jwt.sign({ ...defaultPayload, ...payload }, secret, { expiresIn: '1h' });
}
