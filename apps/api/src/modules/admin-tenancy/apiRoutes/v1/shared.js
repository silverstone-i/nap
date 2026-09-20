/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ERROR_STATUS, sendError } from '../../../../framework/envelope.js';
import {
  clearSessionCookie,
  setSessionCookie,
} from '../../../../framework/cookies.js';

/**
 * Report a domain failure through the shared error envelope.
 *
 * A code the envelope does not recognize becomes `INTERNAL_ERROR`, so an
 * unexpected throw cannot invent a status or leak a database message.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendSessionError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Write the session cookie for a freshly issued token.
 *
 * The cookie's maximum age is the session's remaining absolute lifetime, so
 * it can never outlive the record it points at — M0001-04 §10. A rotation
 * late in a session therefore shortens the cookie rather than renewing it.
 * @param {import('express').Response} response
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} cookiePolicy
 * @param {string} token
 * @param {object} session Safe session view carrying `absoluteExpiresAt`.
 * @returns {void}
 */
export function issueSessionCookie(response, cookiePolicy, token, session) {
  const expiry = new Date(session.absoluteExpiresAt).getTime();
  setSessionCookie(response, cookiePolicy, token, expiry - Date.now());
}

/**
 * Discard the browser's session cookie.
 * @param {import('express').Response} response
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} cookiePolicy
 * @returns {void}
 */
export function discardSessionCookie(response, cookiePolicy) {
  clearSessionCookie(response, cookiePolicy);
}

/**
 * Report an authentication failure through the shared error envelope.
 *
 * Identical to `sendSessionError` but for `THROTTLED`, which must tell the
 * caller when to come back. M0001-03 §10 requires the header, and the body
 * stays the same fixed sentence every other refusal uses, so the envelope
 * itself still reveals nothing about the account.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendAuthError(response, error) {
  const code = error?.code;
  if (code === 'THROTTLED' && Number.isFinite(error?.retryAfterSeconds))
    return sendError(response, 'THROTTLED', {
      'Retry-After': String(Math.max(1, Math.ceil(error.retryAfterSeconds))),
    });
  sendSessionError(response, error);
}
