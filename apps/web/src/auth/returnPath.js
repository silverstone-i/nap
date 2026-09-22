/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The one piece of routing state F0001 allows to survive a trip
 * through `/login`: a temporary, same-origin return path. Business rule
 * (§7): "A return path must be a normalized application path on the current
 * origin. It must not contain credentials and must not accept a scheme,
 * host, protocol-relative path, or non-application destination."
 */

const STORAGE_KEY = 'nap.returnPath';

/**
 * The only shapes a return path may take — the feature's own protected
 * routes. Anything else (a scheme, a host, `//evil.example`, an unknown
 * path) is rejected outright.
 */
const SAFE_PATH_PATTERN =
  /^\/(app\/[^/]+(?:\/.*)?|management(?:\/.*)?|tenants|password)$/;

/**
 * Whether `path` is a safe, normalized, same-origin application path.
 * @param {unknown} path
 * @returns {boolean}
 */
export function isSafeReturnPath(path) {
  return (
    typeof path === 'string' &&
    SAFE_PATH_PATTERN.test(path) &&
    !path.includes('..')
  );
}

/**
 * Remember a return path for after authentication, if and only if it is
 * safe. An unsafe value is silently dropped rather than stored.
 * @param {string} path
 * @returns {void}
 */
export function storeReturnPath(path) {
  if (!isSafeReturnPath(path)) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // Best-effort: worst case the user lands on their default destination.
  }
}

/**
 * Read and clear the stored return path, re-validating it before handing it
 * back — the caller must still authorize it against the fresh access
 * context before navigating there (F0001-R005).
 * @returns {string|null}
 */
export function consumeReturnPath() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    window.sessionStorage.removeItem(STORAGE_KEY);
    return isSafeReturnPath(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Re-authorize a consumed return path against the freshly loaded access
 * context before navigating there (F0001-R005: "must authorize it again
 * before returning"). A path for a tenant shell or platform area the
 * caller no longer has is discarded, never trusted at face value.
 * @param {string|null} path
 * @param {{selectedTenant?: {id: string}|null, entryPoints?: {platform?: boolean, tenant?: boolean}|null}} session
 * @returns {string|null}
 */
export function reauthorizeReturnPath(path, session) {
  if (!isSafeReturnPath(path)) return null;
  if (path === '/tenants') return session.entryPoints?.tenant ? path : null;
  if (path === '/password') return path;
  if (path.startsWith('/management'))
    return session.entryPoints?.platform ? path : null;
  if (path.startsWith('/app/')) {
    const [, , tenantId] = path.split('/');
    return session.selectedTenant?.id === tenantId ? path : null;
  }
  return null;
}

/**
 * Clear the stored return path without reading it, used on logout.
 * @returns {void}
 */
export function clearReturnPath() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
