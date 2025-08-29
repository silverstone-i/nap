'use strict';

export function setAuthCookies(res, { accessToken, refreshToken }) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieSecure = isProduction || process.env.COOKIE_SECURE === 'true';
  const sameSite = process.env.COOKIE_SAMESITE || 'Lax';

  if (accessToken) {
    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite,
      maxAge: 15 * 60 * 1000,
    });
  }

  if (refreshToken) {
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearAuthCookies(res) {
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');
}

export default { setAuthCookies, clearAuthCookies };
