/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Name of the BFF session cookie. The browser holds nothing else. */
export const SESSION_COOKIE = 'nap_session';

/**
 * Read one cookie from a raw `Cookie` header.
 *
 * Written here rather than taken from `cookie-parser` because the API needs
 * exactly one cookie and no request-object monkey patching. A repeated name
 * keeps its first value, which is what browsers send first for the most
 * specific path, so a wider-path cookie cannot shadow the session.
 * @param {string|undefined} header Raw `Cookie` header.
 * @param {string} name Cookie name to read.
 * @returns {string|undefined} The decoded value, or `undefined` when absent.
 */
export function readCookie(header, name) {
  if (typeof header !== 'string' || !header) return undefined;
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    const value = pair.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return undefined;
}

/**
 * Cookie attributes shared by every session cookie this API writes.
 *
 * `httpOnly` keeps the token out of scripts, `path: '/'` with no `domain`
 * keeps it on this origin and its exact host, and `sameSite` is `lax` or
 * `strict` only — `runtimeConfiguration` rejects `none`, so this module never
 * has to encode that policy twice.
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} policy
 * @returns {object} Options for `response.cookie`.
 */
function baseOptions(policy) {
  return {
    httpOnly: true,
    sameSite: policy.sameSite,
    secure: policy.secure,
    path: '/',
  };
}

/**
 * Write the session cookie.
 *
 * `maxAgeMs` is the session's remaining absolute lifetime, so the cookie can
 * never outlive the record it points at. A nonpositive remainder writes a
 * session cookie with no `Max-Age`, which the browser drops when it closes.
 * @param {import('express').Response} response
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} policy
 * @param {string} token Opaque session token.
 * @param {number} maxAgeMs Remaining absolute lifetime in milliseconds.
 * @returns {void}
 */
export function setSessionCookie(response, policy, token, maxAgeMs) {
  const options = baseOptions(policy);
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0)
    options.maxAge = Math.floor(maxAgeMs);
  response.cookie(SESSION_COOKIE, token, options);
}

/**
 * Clear the session cookie. The attributes must match `setSessionCookie` or
 * the browser keeps the original cookie alongside the expired one.
 * @param {import('express').Response} response
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} policy
 * @returns {void}
 */
export function clearSessionCookie(response, policy) {
  response.clearCookie(SESSION_COOKIE, baseOptions(policy));
}
