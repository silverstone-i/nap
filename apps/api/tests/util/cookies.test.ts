/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  ACCESS_COOKIE,
  accessCookieOptions,
  clearAccessCookieOptions,
  clearRefreshCookieOptions,
  REFRESH_COOKIE,
  refreshCookieOptions,
} from '../../src/util/cookies.js';
import { ACCESS_TOKEN_TTL_SECONDS } from '../../src/util/tokens.js';

const CONFIG = { secure: true, sameSite: 'strict' } as const;

describe('cookie contracts', () => {
  it('uses the fixed names', () => {
    expect(ACCESS_COOKIE).toBe('nap_access');
    expect(REFRESH_COOKIE).toBe('nap_refresh');
  });

  it('scopes the access cookie to /api for the token lifetime', () => {
    expect(accessCookieOptions(CONFIG)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api',
      maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
    });
  });

  it('scopes the refresh cookie to the auth router with the given lifetime', () => {
    expect(refreshCookieOptions(CONFIG, 12_345)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/v1',
      maxAge: 12_345,
    });
  });

  it('clearing options repeat the identity fields without maxAge', () => {
    expect(clearAccessCookieOptions(CONFIG)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api',
    });
    expect(clearRefreshCookieOptions(CONFIG)).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth/v1',
    });
  });
});
