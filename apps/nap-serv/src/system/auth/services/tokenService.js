/**
 * @file JWT utilities — sign and verify access/refresh tokens per PRD §3.1.1
 * @module auth/services/tokenService
 *
 * Token claims: sub (user UUID), ph (permission hash), iss, aud.
 * Access token: 15-minute expiry. Refresh token: 7-day expiry.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import jwt from 'jsonwebtoken';

function getAccessSecret() {
  return process.env.ACCESS_TOKEN_SECRET;
}

function getRefreshSecret() {
  return process.env.REFRESH_TOKEN_SECRET;
}

/**
 * Sign an access token (15-minute expiry).
 * @param {object} user User object with at least { id }
 * @param {object} [extras] Additional claims: { sub, ph }
 * @returns {string} Signed JWT
 */
export function signAccessToken(user, extras = {}) {
  const payload = {
    sub: extras.sub || user.id,
    ph: extras.ph || null,
    iss: 'nap-serv',
    aud: 'nap-serv-api',
  };
  return jwt.sign(payload, getAccessSecret(), { expiresIn: '15m' });
}

/**
 * Sign a refresh token (7-day expiry).
 * @param {object} user User object with at least { id }
 * @param {object} [extras] Additional claims: { sub }
 * @returns {string} Signed JWT
 */
export function signRefreshToken(user, extras = {}) {
  const payload = {
    sub: extras.sub || user.id,
    iss: 'nap-serv',
    aud: 'nap-serv-api',
  };
  return jwt.sign(payload, getRefreshSecret(), { expiresIn: '7d' });
}

/**
 * Verify and decode an access token.
 * @param {string} token JWT string
 * @returns {object} Decoded payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
export function verifyAccess(token) {
  return jwt.verify(token, getAccessSecret());
}

/**
 * Verify and decode a refresh token.
 * @param {string} token JWT string
 * @returns {object} Decoded payload
 * @throws {jwt.JsonWebTokenError|jwt.TokenExpiredError}
 */
export function verifyRefresh(token) {
  return jwt.verify(token, getRefreshSecret());
}

export default { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh };
