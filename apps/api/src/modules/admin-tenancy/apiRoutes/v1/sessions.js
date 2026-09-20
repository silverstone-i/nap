/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendNoContent } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { revokeSession } from '../../domain/session.js';
import {
  accessScope,
  resolveAuthorization,
} from '../../domain/authorization.js';
import { discardSessionCookie, sendSessionError } from './shared.js';

/**
 * Build the `sessions` router: revoke a session by identifier.
 *
 * Self-revocation passes no platform scope. Revoking another user's session
 * derives the caller's root authority and passes its scope to `revokeSession`,
 * which enforces M0001-04-R007. Role-based operator authority remains deferred
 * with the rest of M0001-05.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createSessionsRouter({ admin, cookiePolicy }) {
  const router = Router();

  router.delete('/:id', requireSession(), async (request, response) => {
    try {
      const scope =
        request.params.id === request.session.id
          ? null
          : accessScope(
              await resolveAuthorization(admin.db, request.session),
              'admin-tenancy::sessions::revoke'
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
  });

  return router;
}
