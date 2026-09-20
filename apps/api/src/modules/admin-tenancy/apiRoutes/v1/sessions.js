/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendNoContent } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { revokeSession } from '../../domain/session.js';
import { discardSessionCookie, sendSessionError } from './shared.js';

/**
 * Build the `sessions` router: revoke a session by identifier.
 *
 * The route passes `scope: null`, so the only session a caller can revoke
 * over HTTP today is their own. Platform-operator revocation is implemented
 * in `revokeSession`, which takes the operator's scope and enforces
 * M0001-04-R007 against it; M0001-05 supplies that scope from the caller's
 * platform roles, and this route gains it then. Nothing here has to change
 * for the authorization rule itself.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createSessionsRouter({ admin, cookiePolicy }) {
  const router = Router();

  router.delete('/:id', requireSession(), async (request, response) => {
    try {
      await revokeSession(
        admin.db,
        { actorId: request.session.user, scope: null },
        request.params.id,
        { requestId: request.requestId }
      );
      // Revoking the session the request arrived on is a logout by another
      // name, so the cookie goes with it.
      if (request.params.id === request.session.id)
        discardSessionCookie(response, cookiePolicy);
      sendNoContent(response);
    } catch (error) {
      sendSessionError(response, error);
    }
  });

  return router;
}
