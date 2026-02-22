/**
 * @file Cookie helpers — set and clear httpOnly auth cookies per PRD §3.1.1
 * @module nap-serv/lib/cookies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

const AUTH_COOKIE = 'auth_token';
const REFRESH_COOKIE = 'refresh_token';

/**
 * Set httpOnly auth cookies on the response.
 * @param {object} res Express response
 * @param {object} tokens
 * @param {string} tokens.accessToken JWT access token
 * @param {string} tokens.refreshToken JWT refresh token
 */
export function setAuthCookies(res, { accessToken, refreshToken }) {
  const isProduction = process.env.NODE_ENV === 'production';
  const secure = isProduction || process.env.COOKIE_SECURE === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'Lax';

  if (accessToken) {
    res.cookie(AUTH_COOKIE, accessToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
  }

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}

/**
 * Clear auth cookies from the response.
 * @param {object} res Express response
 */
export function clearAuthCookies(res) {
  res.clearCookie(AUTH_COOKIE);
  res.clearCookie(REFRESH_COOKIE);
}

export default { setAuthCookies, clearAuthCookies };
