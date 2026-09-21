/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  SESSION_COOKIE,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from '../framework/cookies.js';
import { sendError } from '../framework/envelope.js';
import {
  ROTATED_TOKEN,
  resolveSession,
} from '../modules/admin-tenancy/domain/session.js';

/**
 * Resolve the presented session cookie and attach the result.
 *
 * The handler never rejects a request on its own. It sets
 * `request.sessionToken` and `request.session`, leaving both `undefined` when
 * no usable cookie was presented, and lets each route decide what it needs:
 * `/auth/logout` accepts an expired cookie, while `/session/current` does not.
 *
 * A cookie that was presented and did not resolve is cleared here. It is
 * provably unusable — unknown, tampered with, expired, or revoked — so
 * leaving it in the browser only guarantees the same rejection on every later
 * request.
 *
 * A failure that is not an authentication decision — the event store or the
 * revision store being unavailable while an expired session is archived —
 * is reported rather than swallowed, so a request never proceeds as anonymous
 * because a write failed.
 *
 * `resolveSession` also downgrades an expired support session (M0001-09) and
 * rotates its token as part of that same read. When it does, the new token
 * rides along under the `ROTATED_TOKEN` symbol — never a plain, JSON-visible
 * field — and this middleware writes it as the response cookie immediately,
 * the same shape `issueSessionCookie` uses for an explicit rotation. It also
 * replaces `request.sessionToken` with the rotated value, so a route handler
 * later in the same request that mutates the session (`/access/select`,
 * `/access/support`, `/session/rotate`) hashes the live token instead of the
 * one this read just replaced.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin Admin database handle.
 * @param {object} context.sessionPolicy Session secret and lifetimes.
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').RequestHandler}
 */
export function sessionContext({ admin, sessionPolicy, cookiePolicy }) {
  return async (request, response, next) => {
    request.sessionToken = readCookie(request.headers.cookie, SESSION_COOKIE);
    request.session = undefined;
    if (request.sessionToken === undefined) return next();
    try {
      request.session = await resolveSession(
        admin.db,
        sessionPolicy,
        request.sessionToken,
        { requestId: request.requestId }
      );
      const rotatedToken = request.session[ROTATED_TOKEN];
      if (rotatedToken) {
        request.sessionToken = rotatedToken;
        const expiry = new Date(request.session.absoluteExpiresAt).getTime();
        setSessionCookie(
          response,
          cookiePolicy,
          rotatedToken,
          expiry - Date.now()
        );
      }
    } catch (error) {
      if (error?.code !== 'UNAUTHENTICATED')
        return sendError(response, error?.code ?? 'INTERNAL_ERROR');
      clearSessionCookie(response, cookiePolicy);
    }
    next();
  };
}

/**
 * Require a resolved session.
 *
 * A session restricted by `must_change_password` reaches only the password
 * change and logout routes, which is the restricted-session row of
 * M0001-04 §8. Pass `allowRestricted` on those two routes alone.
 * @param {{allowRestricted?: boolean}} [options]
 * @returns {import('express').RequestHandler}
 */
export function requireSession({ allowRestricted = false } = {}) {
  return (request, response, next) => {
    if (!request.session) return sendError(response, 'UNAUTHENTICATED');
    if (request.session.restricted && !allowRestricted)
      return sendError(response, 'PASSWORD_CHANGE_REQUIRED');
    next();
  };
}
