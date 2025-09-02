'use strict';

import jwt from 'jsonwebtoken';

const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;

export function signAccessToken(user, extras = {}) {
  const payload = {
    sub: extras.sub || user.id,
    ph: extras.ph,
    sid: extras.sid,
    iss: 'nap-serv',
    aud: 'nap-serv-api',
  };
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(user, extras = {}) {
  const payload = { sub: extras.sub || user.id, sid: extras.sid, iss: 'nap-serv', aud: 'nap-serv-api' };
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
}

export function verifyAccess(token) {
  return jwt.verify(token, ACCESS_TOKEN_SECRET);
}

export function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_TOKEN_SECRET);
}

export default { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh };
