/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { resolveAuthorization } from '../../domain/authorization.js';
import {
  enterSupport,
  exitSupport,
  listEligibleTenants,
  selectTenant,
} from '../../domain/tenantAccess.js';
import {
  discardSessionCookie,
  issueSessionCookie,
  sendSessionError,
} from './shared.js';

/**
 * Build the `access` router: tenant selection and support access. See
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md.
 *
 * `authorization.js` currently resolves only root or no platform authority
 * (M0001-05's role-based `platform_admin`/`support` remains deferred), so
 * `POST /support` is reachable only by root today — the same caveat
 * `tenants.js`, `control.js`, and M0001-04's `sessions` router already
 * document. `POST /select` needs no capability at all: it operates purely on
 * the caller's own membership.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {object} context.sessionPolicy
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @returns {import('express').Router}
 */
export function createAccessRouter({ admin, sessionPolicy, cookiePolicy }) {
  const router = Router();

  router.get('/tenants', requireSession(), async (request, response) => {
    try {
      const tenants = await listEligibleTenants(admin.db, request.session.user);
      sendData(response, tenants);
    } catch (error) {
      sendSessionError(response, error);
    }
  });

  router.post('/select', requireSession(), async (request, response) => {
    try {
      const result = await selectTenant(
        admin.db,
        sessionPolicy,
        request.sessionToken,
        request.session,
        request.body,
        { requestId: request.requestId }
      );
      issueSessionCookie(response, cookiePolicy, result.token, result.session);
      sendData(response, result.session);
    } catch (error) {
      if (error?.code === 'UNAUTHENTICATED')
        discardSessionCookie(response, cookiePolicy);
      sendSessionError(response, error);
    }
  });

  router.post('/support', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const result = await enterSupport(
        admin.db,
        sessionPolicy,
        request.sessionToken,
        request.session,
        context,
        request.body,
        { requestId: request.requestId }
      );
      issueSessionCookie(response, cookiePolicy, result.token, result.session);
      sendData(response, result.session);
    } catch (error) {
      if (error?.code === 'UNAUTHENTICATED')
        discardSessionCookie(response, cookiePolicy);
      sendSessionError(response, error);
    }
  });

  router.delete('/support', requireSession(), async (request, response) => {
    try {
      const result = await exitSupport(
        admin.db,
        sessionPolicy,
        request.sessionToken,
        request.session,
        { requestId: request.requestId }
      );
      issueSessionCookie(response, cookiePolicy, result.token, result.session);
      sendData(response, result.session);
    } catch (error) {
      if (error?.code === 'UNAUTHENTICATED')
        discardSessionCookie(response, cookiePolicy);
      sendSessionError(response, error);
    }
  });

  return router;
}
