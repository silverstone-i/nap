/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData, sendNoContent } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  listSessions,
  revokeSession,
  revokeSessions,
} from '../../domain/session.js';
import { requireCapability } from '../../../../capability/requireCapability.js';
import { accessScope } from '../../domain/authorization.js';
import { discardSessionCookie, sendSessionError } from './shared.js';

/** Query parameters `GET /sessions` passes to the domain (I0009-R002). */
const LIST_FILTERS = ['userId', 'email', 'tenantId', 'from', 'to', 'status'];

/**
 * Build the `sessions` router: list sessions, revoke several at once
 * (I0009), and revoke one by identifier.
 *
 * Self-revocation needs only the session. Revoking another user's session
 * requires `admin-tenancy::sessions::revoke` against the Napsoft tenant
 * (I0005-R003), and the permitted scope goes to `revokeSession`, which
 * enforces M0001-04-R007.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createSessionsRouter({ admin, cookiePolicy }) {
  const router = Router();
  const revoke = requireCapability('admin-tenancy::sessions::revoke', {
    target: 'napsoft',
  });

  router.get(
    '/',
    requireSession(),
    requireCapability('admin-tenancy::sessions::read', { target: 'napsoft' }),
    async (request, response) => {
      try {
        const query = {};
        for (const key of LIST_FILTERS)
          if (typeof request.query[key] === 'string' && request.query[key])
            query[key] = request.query[key];
        if (request.query.cursor !== undefined)
          query.cursor = request.query.cursor;
        if (request.query.limit !== undefined)
          query.limit = Number(request.query.limit);
        const result = await listSessions(
          admin.db,
          accessScope(request.authorization),
          query
        );
        sendData(response, result);
      } catch (error) {
        sendSessionError(response, error);
      }
    }
  );

  router.post(
    '/revoke',
    requireSession(),
    requireCapability('admin-tenancy::sessions::revoke', { target: 'napsoft' }),
    async (request, response) => {
      try {
        const ids = request.body?.ids;
        await revokeSessions(
          admin.db,
          {
            actorId: request.session.user,
            scope: accessScope(request.authorization),
          },
          ids,
          { requestId: request.requestId }
        );
        // I0009-R011: revoking the session this request arrived on is a
        // logout, so the cookie goes with it.
        if (Array.isArray(ids) && ids.includes(request.session.id))
          discardSessionCookie(response, cookiePolicy);
        sendNoContent(response);
      } catch (error) {
        sendSessionError(response, error);
      }
    }
  );
  // Skips the check for the caller's own session; declares the capability
  // for the I0005-R002 startup check either way.
  const revokeGuard = (request, response, next) =>
    request.params.id === request.session.id
      ? next()
      : revoke(request, response, next);
  revokeGuard.capability = revoke.capability;

  router.delete(
    '/:id',
    requireSession(),
    revokeGuard,
    async (request, response) => {
      try {
        const scope =
          request.params.id === request.session.id
            ? null
            : accessScope(request.authorization);
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
