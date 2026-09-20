/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { rotateSession } from '../../domain/session.js';
import {
  discardSessionCookie,
  issueSessionCookie,
  sendSessionError,
} from './shared.js';

/**
 * Build the `session` router: read and rotate the caller's own session.
 *
 * Both routes act on the session the cookie already resolved, so neither
 * takes an identifier. A session identifier in a path would let a caller
 * probe for other users' sessions, and nothing here needs one.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {object} context.sessionPolicy
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createSessionRouter({ admin, sessionPolicy, cookiePolicy }) {
  const router = Router();

  router.get('/current', requireSession(), (request, response) =>
    sendData(response, request.session)
  );

  router.post('/rotate', requireSession(), async (request, response) => {
    try {
      const rotated = await rotateSession(
        admin.db,
        sessionPolicy,
        request.sessionToken,
        { requestId: request.requestId }
      );
      issueSessionCookie(
        response,
        cookiePolicy,
        rotated.token,
        rotated.session
      );
      // Rotation reads only `admin.sessions`, so the rotated row carries no
      // account flags. The restriction was already decided during resolution;
      // carrying it across keeps one response shape for both routes.
      sendData(response, {
        ...rotated.session,
        restricted: request.session.restricted,
      });
    } catch (error) {
      // The token lost a rotation race, expired between resolution and this
      // statement, or was revoked. The browser's copy is useless either way.
      if (error?.code === 'UNAUTHENTICATED')
        discardSessionCookie(response, cookiePolicy);
      sendSessionError(response, error);
    }
  });

  return router;
}
