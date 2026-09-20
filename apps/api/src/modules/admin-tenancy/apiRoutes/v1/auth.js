/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendNoContent } from '../../../../framework/envelope.js';
import { logoutSession } from '../../domain/session.js';
import { discardSessionCookie, sendSessionError } from './shared.js';

/**
 * Build the `auth` router.
 *
 * Only logout belongs to this Work Unit; M0001-03 adds login and password
 * change to the same router.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {object} context.sessionPolicy
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createAuthRouter({ admin, sessionPolicy, cookiePolicy }) {
  const router = Router();

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
