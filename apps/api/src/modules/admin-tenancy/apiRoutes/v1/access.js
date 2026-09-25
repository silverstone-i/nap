/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { permits, resolveAuthorization } from '../../domain/authorization.js';
import { AdminAccessError } from '../../domain/errors.js';
import {
  eligibleTenantView,
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
 * (M0569's role-based `platform_admin`/`support` remains deferred), so
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

  // I0001-R022. Same guard convention as `GET /session/current`: no
  // `allowRestricted`, so a restricted session gets
  // `403 PASSWORD_CHANGE_REQUIRED` and the browser client treats that code
  // as "go to /password" the same way it already does for every other
  // protected read.
  router.get('/context', requireSession(), async (request, response) => {
    try {
      const { session } = request;
      const [user, authorization, tenants, selectedTenant, operator] =
        await Promise.all([
          admin.db.portal_users.findOneBy(
            { id: session.user, status: 'active' },
            { columnWhitelist: ['id', 'email'] }
          ),
          resolveAuthorization(admin.db, session),
          listEligibleTenants(admin.db, session.user),
          session.tenant
            ? admin.db.tenants.findOneBy(
                { id: session.tenant },
                { columnWhitelist: ['id', 'tenant_code', 'name', 'tier'] }
              )
            : null,
          admin.db.tenants.findOneBy(
            { is_napsoft: true, status: 'active' },
            { columnWhitelist: ['id', 'tenant_code', 'name', 'tier'] }
          ),
        ]);
      // `resolveAuthorization` above runs the same `status: 'active'` lookup
      // and already rejects when it comes up empty, but this handler must
      // not depend on that sibling call's `Promise.all` ordering for its own
      // correctness — guard it directly, same as `resolveAuthorization` does.
      if (!user) throw new AdminAccessError('FORBIDDEN');
      sendData(response, {
        session,
        user: { id: user.id, email: user.email },
        selectedTenant: selectedTenant
          ? eligibleTenantView(selectedTenant)
          : null,
        // The platform operator's own company — a fixed, single record
        // (`is_napsoft` is unique) rather than a caller-eligible tenant.
        // Shown by the shell in platform context, where there is no
        // selected tenant to display instead.
        operator: operator ? eligibleTenantView(operator) : null,
        entryPoints: {
          platform: authorization.platform !== null,
          tenant: tenants.length > 0,
          // I0001-R024: a real, per-destination signal for the platform
          // shell's Tenant Management nav group (I0001-R023), derived from
          // the same resolved capabilities the server already enforces on
          // each underlying route — never a stand-in built from the
          // coarser `platform` flag above, and never the raw capability
          // list itself.
          tenantManagement: {
            tenants: permits(authorization, 'admin-tenancy::control::read'),
            cells: permits(authorization, 'admin-tenancy::control::read'),
            portalUsers: permits(
              authorization,
              'admin-tenancy::accounts::read'
            ),
          },
        },
      });
    } catch (error) {
      sendSessionError(response, error);
    }
  });

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
