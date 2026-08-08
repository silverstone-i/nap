/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CookieOptions } from 'express';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokens.js';

export const ACCESS_COOKIE = 'nap_access';
export const REFRESH_COOKIE = 'nap_refresh';

/** Paths are part of a cookie's identity: clearing must reuse them exactly. */
const ACCESS_PATH = '/api';
// Spans all six auth routes, not just /refresh: logout and password-change
// identify the caller's session by the refresh token's embedded session id —
// the access JWT carries only `sub` + `ph` (ADR-0004), so it cannot.
const REFRESH_PATH = '/api/auth/v1';

/** Flag values injected from env by the entrypoint (RULES/api-server.md). */
export interface CookieConfig {
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
}

export function accessCookieOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: ACCESS_PATH,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  };
}

/** `maxAgeMs` is the time remaining to the session's absolute expiry. */
export function refreshCookieOptions(
  config: CookieConfig,
  maxAgeMs: number
): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: REFRESH_PATH,
    maxAge: maxAgeMs,
  };
}

/** Options for res.clearCookie — identity fields only, no maxAge. */
export function clearAccessCookieOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: ACCESS_PATH,
  };
}

export function clearRefreshCookieOptions(config: CookieConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.secure,
    sameSite: config.sameSite,
    path: REFRESH_PATH,
  };
}
