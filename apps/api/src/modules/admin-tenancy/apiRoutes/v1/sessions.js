/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendNoContent } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { revokeSession } from '../../domain/session.js';
import { authorize } from '../../../../capability/authorize.js';
import { sessionOnly } from '../../../../capability/requireCapability.js';
import { accessScope } from '../../domain/authorization.js';
import { discardSessionCookie, sendSessionError } from './shared.js';

/**
 * Build the `sessions` router: revoke a session by identifier.
 *
 * Self-revocation needs only the session, so the route is `sessionOnly`.
 * Revoking another user's session decides `admin-tenancy::sessions::revoke`
 * against the Napsoft tenant (I0005-R003) and passes the resulting scope to
 * `revokeSession`, which enforces M0001-04-R007.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createSessionsRouter({ admin, cookiePolicy }) {
  const router = Router();

  router.delete(
    '/:id',
    requireSession(),
    sessionOnly,
    async (request, response) => {
      try {
        const scope =
          request.params.id === request.session.id
            ? null
            : accessScope(
                await authorize(
                  request.app.locals.authorization,
                  request.session,
                  'admin-tenancy::sessions::revoke',
                  { target: 'napsoft' }
                )
              );
        await revokeSession(
          admin.db,
          { actorId: request.session.user, scope },
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
    }
  );

  return router;
}
