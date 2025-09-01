'use strict';

import jwt from 'jsonwebtoken';

const MODE_MINIMAL = (process.env.AUTH_MODE || '').toLowerCase() === 'redis';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export function signAccessToken(user, extras = {}) {
  if (MODE_MINIMAL) {
    const payload = {
      sub: extras.sub || user.id,
      ph: extras.ph,
      sid: extras.sid,
      iss: 'nap-serv',
      aud: 'nap-serv-api',
    };
    return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
  }
  const payload = {
    id: user.id,
    email: user.email,
    user_name: user.user_name,
    tenant_code: user.tenant_code,
    role: user.role,
    schema_name: user.schema_name?.toLowerCase?.() || user.tenant_code?.toLowerCase?.() || null,
    ...extras,
  };
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(user, extras = {}) {
  if (MODE_MINIMAL) {
    const payload = { sub: extras.sub || user.id, sid: extras.sid, iss: 'nap-serv', aud: 'nap-serv-api' };
    return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  }
  const payload = { email: user.email, ...extras };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

export function verifyAccess(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

export default { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh };
