/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData, sendNoContent } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  changePassword,
  login,
  loginRequestSchema,
  passwordChangeRequestSchema,
} from '../../domain/authentication.js';
import { logoutSession } from '../../domain/session.js';
import {
  discardSessionCookie,
  issueSessionCookie,
  sendAuthError,
  sendSessionError,
} from './shared.js';

/**
 * Build the `auth` router: log in, replace a password, and log out.
 *
 * Every route here changes state, so all three are covered by the browser
 * request protection registered for `/api` in `app.js`. None of them repeats
 * the check — a route that could opt out would be a route that could forget.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {object} context.sessionPolicy
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @param {{throttleSecret: string, memoryKib: number, timeCost: number, parallelism: number}} context.authenticationPolicy
 * @returns {import('express').Router}
 */
export function createAuthRouter({
  admin,
  sessionPolicy,
  cookiePolicy,
  authenticationPolicy,
}) {
  const router = Router();
  const policies = {
    session: sessionPolicy,
    hashing: {
      memoryKib: authenticationPolicy?.memoryKib,
      timeCost: authenticationPolicy?.timeCost,
      parallelism: authenticationPolicy?.parallelism,
    },
    throttle: { secret: authenticationPolicy?.throttleSecret },
  };

  // No session guard: a caller with a live cookie may still log in, and
  // requiring one here would make the first login impossible. A malformed
  // body is a failed attempt rather than a `400`, because §10 gives login two
  // failure codes and `INVALID_INPUT` is not one of them — answering
  // differently would tell an attacker which of their guesses was well-formed.
  router.post('/login', async (request, response) => {
    const body = loginRequestSchema.safeParse(request.body);
    try {
      const { token, session } = await login(admin.db, policies, {
        email: body.success ? body.data.email : null,
        password: body.success ? body.data.password : null,
        clientAddress: request.ip,
        requestId: request.requestId,
      });
      issueSessionCookie(response, cookiePolicy, token, session);
      sendData(response, session);
    } catch (error) {
      // A failed login leaves any cookie the caller presented alone. It may
      // belong to a different, still-valid session, and a wrong password is
      // no reason to end one.
      sendAuthError(response, error);
    }
  });

  // `allowRestricted` because this is one of the two routes a session held by
  // `must_change_password` may reach — M0001-04 §8. Without it the only way
  // out of a restricted session would be to log out.
  router.post(
    '/password',
    requireSession({ allowRestricted: true }),
    async (request, response) => {
      const body = passwordChangeRequestSchema.safeParse(request.body);
      if (!body.success)
        return sendAuthError(response, { code: 'INVALID_INPUT' });
      try {
        const { token, session } = await changePassword(admin.db, policies, {
          session: request.session,
          token: request.sessionToken,
          currentPassword: body.data.currentPassword,
          newPassword: body.data.newPassword,
          requestId: request.requestId,
        });
        issueSessionCookie(response, cookiePolicy, token, session);
        sendData(response, session);
      } catch (error) {
        sendAuthError(response, error);
      }
    }
  );

  // Logout takes no session guard on purpose. A user whose session has
  // already expired, or whose cookie was never valid, still needs the cookie
  // cleared, and answering `401` here would leave the browser holding it.
  // The request still passes browser request protection, so another site
  // cannot log the user out.
  router.post('/logout', async (request, response) => {
    try {
      await logoutSession(admin.db, sessionPolicy, request.sessionToken, {
        requestId: request.requestId,
      });
      discardSessionCookie(response, cookiePolicy);
      sendNoContent(response);
    } catch (error) {
      sendSessionError(response, error);
    }
  });

  return router;
}
