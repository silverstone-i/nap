/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import {
  sendData,
  sendError,
  sendNoContent,
} from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { createRoleProvider } from '../../domain/roleProvider.js';
import {
  grantRole,
  listRolesForTenant,
  removeRole,
} from '../../domain/roles.js';

function report(response, error) {
  const allowed = new Set([
    'INVALID_INPUT',
    'FORBIDDEN',
    'NOT_FOUND',
    'CONFLICT',
    'AUDIT_UNAVAILABLE',
    'SERVICE_UNAVAILABLE',
  ]);
  sendError(response, allowed.has(error?.code) ? error.code : 'INTERNAL_ERROR');
}

export function createRolesRouter({ admin, cells }) {
  const router = Router();
  const provider = createRoleProvider(admin.db, cells);
  router.get('/:tenant/roles', requireSession(), async (request, response) => {
    try {
      sendData(
        response,
        await listRolesForTenant(
          admin.db,
          provider,
          request.session,
          request.params.tenant
        )
      );
    } catch (error) {
      report(response, error);
    }
  });
  router.put(
    '/:tenant/users/:id/roles/:roleId',
    requireSession(),
    async (request, response) => {
      try {
        sendData(
          response,
          await grantRole(admin.db, provider, request.session, {
            tenantId: request.params.tenant,
            userId: request.params.id,
            roleId: request.params.roleId,
            requestId: request.requestId,
          })
        );
      } catch (error) {
        report(response, error);
      }
    }
  );
  router.delete(
    '/:tenant/users/:id/roles/:roleId',
    requireSession(),
    async (request, response) => {
      try {
        await removeRole(admin.db, provider, request.session, {
          tenantId: request.params.tenant,
          userId: request.params.id,
          roleId: request.params.roleId,
          requestId: request.requestId,
        });
        sendNoContent(response);
      } catch (error) {
        report(response, error);
      }
    }
  );
  return router;
}
