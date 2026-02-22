/**
 * @file Unit tests for cookie helpers
 * @module tests/unit/cookies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { setAuthCookies, clearAuthCookies } from '../../src/lib/cookies.js';

function makeRes() {
  return {
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
}

describe('setAuthCookies', () => {
  beforeEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.COOKIE_SECURE;
    delete process.env.COOKIE_SAMESITE;
  });

  test('sets auth_token and refresh_token cookies', () => {
    const res = makeRes();
    setAuthCookies(res, { accessToken: 'access123', refreshToken: 'refresh456' });

    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie).toHaveBeenCalledWith('auth_token', 'access123', expect.objectContaining({ httpOnly: true }));
    expect(res.cookie).toHaveBeenCalledWith(
      'refresh_token',
      'refresh456',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  test('access token maxAge is 15 minutes', () => {
    const res = makeRes();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' });

    const authCall = res.cookie.mock.calls.find((c) => c[0] === 'auth_token');
    expect(authCall[2].maxAge).toBe(15 * 60 * 1000);
  });

  test('refresh token maxAge is 7 days', () => {
    const res = makeRes();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' });

    const refreshCall = res.cookie.mock.calls.find((c) => c[0] === 'refresh_token');
    expect(refreshCall[2].maxAge).toBe(7 * 24 * 60 * 60 * 1000);
  });

  test('sets secure=true in production', () => {
    process.env.NODE_ENV = 'production';
    const res = makeRes();
    setAuthCookies(res, { accessToken: 'a', refreshToken: 'r' });

    const authCall = res.cookie.mock.calls.find((c) => c[0] === 'auth_token');
    expect(authCall[2].secure).toBe(true);
  });
});

describe('clearAuthCookies', () => {
  test('clears both cookies', () => {
    const res = makeRes();
    clearAuthCookies(res);

    expect(res.clearCookie).toHaveBeenCalledWith('auth_token');
    expect(res.clearCookie).toHaveBeenCalledWith('refresh_token');
  });
});
