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
import { resolveAuthorization } from '../../domain/authorization.js';
import { buildControlAuthority } from '../../domain/cells.js';
import { createTenant } from '../../domain/tenants.js';

/**
 * Report a tenant-creation failure through the shared error envelope.
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
 * assignment. See docs/PRDs/modules/M0001-admin-tenancy/M0001-07-tenant-creation.md.
 *
 * Reuses the `admin-tenancy::control::write` capability and
 * `buildControlAuthority` from cell-management (domain/cells.js), so the
 * same M0001-05 caveat applies: `authorization.js` currently resolves only
 * root or no platform authority (role-based `platform_admin`/`support`
 * remains deferred), exactly as `control.js` and M0001-04's `sessions`
 * router already note.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @returns {import('express').Router}
 */
export function createTenantsRouter({ admin }) {
  const router = Router();

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

  return router;
}
