/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import {
  ERROR_STATUS,
  sendData,
  sendError,
} from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  accessScope,
  resolveAuthorization,
} from '../../domain/authorization.js';
import { buildControlAuthority } from '../../domain/cells.js';
import { createTenant } from '../../domain/tenants.js';
import {
  grantEntitlement,
  listEntitlements,
  withdrawEntitlement,
} from '../../domain/entitlements.js';

/**
 * Report a tenant-creation or entitlement failure through the shared error
 * envelope. Both `AdminTenantError` and `AdminEntitlementError` carry the
 * failure entirely in `error.code`, so one mapper serves both.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
function sendTenantError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the `tenants` router: central tenant creation with no cell
 * assignment (M0001-07), and per-tenant module entitlements (M0001-10). See
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md and
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-10-module-entitlements.md.
 * Entitlement routes nest under `/:tenant/entitlements` rather than
 * registering as a separate `entitlements` router, since the route registry
 * mounts one router per `(module, router, version)` triple at
 * `/api/<module>/v<version>/<router>` — a second `router: 'entitlements'`
 * entry would mount at `/api/admin-tenancy/v1/entitlements`, not nested
 * under this one.
 *
 * Tenant creation reuses the `admin-tenancy::control::write` capability and
 * `buildControlAuthority` from cell-management (domain/cells.js); the
 * entitlement routes instead build an `{actorId, scope}` authority via
 * `accessScope`, since entitlements are tenant-scoped like accounts
 * (domain/accounts.js), not registry-shaped like cells/tenant-creation. Both
 * share the same M0001-05 caveat: `authorization.js` currently resolves only
 * root or no platform authority (role-based `platform_admin`/`support`/
 * `tenant_admin` remains deferred), exactly as `control.js` and `accounts.js`
 * already note.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @returns {import('express').Router}
 */
export function createTenantsRouter({ admin }) {
  const router = Router();

  /**
   * Build an `{actorId, scope}` authority for one `admin-tenancy::entitlements::*` capability.
   * @param {import('express').Request} request
   * @param {'admin-tenancy::entitlements::read'|'admin-tenancy::entitlements::write'} capability
   * @returns {Promise<{actorId: string, scope: import('../../domain/scope.js').AdminAccessScope}>}
   */
  async function entitlementAuthority(request, capability) {
    const context = await resolveAuthorization(admin.db, request.session);
    return {
      actorId: context.actorId,
      scope: accessScope(context, capability),
    };
  }

  router.post('/', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const authority = buildControlAuthority(
        context,
        'admin-tenancy::control::write'
      );
      const tenant = await createTenant(
        admin.db,
        authority,
        request.body,
        request.get('Idempotency-Key'),
        { requestId: request.requestId }
      );
      sendData(response, tenant, 201);
    } catch (error) {
      sendTenantError(response, error);
    }
  });

  router.get(
    '/:tenant/entitlements',
    requireSession(),
    async (request, response) => {
      try {
        const read = await entitlementAuthority(
          request,
          'admin-tenancy::entitlements::read'
        );
        const entitlements = await listEntitlements(
          admin.db,
          read,
          request.params.tenant
        );
        sendData(response, entitlements);
      } catch (error) {
        sendTenantError(response, error);
      }
    }
  );

  router.put(
    '/:tenant/entitlements/:module',
    requireSession(),
    async (request, response) => {
      try {
        const write = await entitlementAuthority(
          request,
          'admin-tenancy::entitlements::write'
        );
        const entitlement = await grantEntitlement(
          admin.db,
          write,
          request.params.tenant,
          request.params.module,
          { requestId: request.requestId }
        );
        sendData(response, entitlement);
      } catch (error) {
        sendTenantError(response, error);
      }
    }
  );

  // Returns 200 with the resulting (disabled) representation, not 204: PRD
  // M0001-10 §10 — "Grant and withdrawal return 200, including repeated
  // requests" — unlike `accounts.js`'s `DELETE /memberships/:id` (204).
  router.delete(
    '/:tenant/entitlements/:module',
    requireSession(),
    async (request, response) => {
      try {
        const write = await entitlementAuthority(
          request,
          'admin-tenancy::entitlements::write'
        );
        const entitlement = await withdrawEntitlement(
          admin.db,
          write,
          request.params.tenant,
          request.params.module,
          { requestId: request.requestId }
        );
        sendData(response, entitlement);
      } catch (error) {
        sendTenantError(response, error);
      }
    }
  );

  return router;
}
