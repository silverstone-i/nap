/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { sessionOnly } from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { AdminAccessError } from '../../domain/errors.js';
import {
  eligibleTenantView,
  listEligibleTenants,
  selectTenant,
} from '../../domain/tenantAccess.js';
import {
  discardSessionCookie,
  issueSessionCookie,
  sendSessionError,
} from './shared.js';

/**
 * Build the `access` router: access context and tenant selection. See
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-09-tenant-selection-and-support-access.md.
 *
 * `POST /select` needs no capability at all: it operates purely on the
 * caller's own membership.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {object} context.sessionPolicy
 * @param {{secure: boolean, sameSite: 'lax'|'strict'}} context.cookiePolicy
 * @param {{readiness: Function}} [context.runtime] Runtime cell registry (I0003-R020).
 * @returns {import('express').Router}
 */
export function createAccessRouter({
  admin,
  sessionPolicy,
  cookiePolicy,
  runtime,
}) {
  const router = Router();

  // I0001-R022. Same guard convention as `GET /session/current`: no
  // `allowRestricted`, so a restricted session gets
  // `403 PASSWORD_CHANGE_REQUIRED` and the browser client treats that code
  // as "go to /password" the same way it already does for every other
  // protected read.
  router.get(
    '/context',
    requireSession(),
    sessionOnly,
    async (request, response) => {
      try {
        const { session } = request;
        const [user, tenants, selectedTenant, operator] = await Promise.all([
          admin.db.portal_users.findOneBy(
            { id: session.user, status: 'active' },
            { columnWhitelist: ['id', 'email'] }
          ),
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
        if (!user) throw new AdminAccessError('FORBIDDEN');
        sendData(response, {
          session,
          user: { id: user.id, email: user.email },
          selectedTenant: selectedTenant
            ? eligibleTenantView(selectedTenant)
            : null,
          // The platform operator's own company — a fixed, single record
          // (`is_napsoft` is unique) rather than a caller-eligible tenant.
          // Shown by the tenant control to a user with no eligible tenant.
          operator: operator ? eligibleTenantView(operator) : null,
          // What the user may do comes from `GET /session/capabilities`
          // (I0005-R010).
          entryPoints: { tenant: tenants.length > 0 },
        });
      } catch (error) {
        sendSessionError(response, error);
      }
    }
  );

  router.get(
    '/tenants',
    requireSession(),
    sessionOnly,
    async (request, response) => {
      try {
        const tenants = await listEligibleTenants(
          admin.db,
          request.session.user
        );
        sendData(response, tenants);
      } catch (error) {
        sendSessionError(response, error);
      }
    }
  );

  router.post(
    '/select',
    requireSession(),
    sessionOnly,
    async (request, response) => {
      try {
        const result = await selectTenant(
          admin.db,
          sessionPolicy,
          request.sessionToken,
          request.session,
          request.body,
          { requestId: request.requestId, runtime }
        );
        issueSessionCookie(
          response,
          cookiePolicy,
          result.token,
          result.session
        );
        sendData(response, result.session);
      } catch (error) {
        if (error?.code === 'UNAUTHENTICATED')
          discardSessionCookie(response, cookiePolicy);
        sendSessionError(response, error);
      }
    }
  );

  return router;
}
