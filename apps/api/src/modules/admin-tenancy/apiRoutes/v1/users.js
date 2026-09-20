/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData, sendError } from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import { createRoleProvider } from '../../domain/roleProvider.js';
import { listRolesForUser } from '../../domain/roles.js';

export function createUsersRouter({ admin, cells }) {
  const router = Router();
  const provider = createRoleProvider(admin.db, cells);
  router.get('/:id/roles', requireSession(), async (request, response) => {
    try {
      sendData(
        response,
        await listRolesForUser(
          admin.db,
          provider,
          request.session,
          request.params.id
        )
      );
    } catch (error) {
      sendError(
        response,
        [
          'INVALID_INPUT',
          'FORBIDDEN',
          'NOT_FOUND',
          'SERVICE_UNAVAILABLE',
        ].includes(error?.code)
          ? error.code
          : 'INTERNAL_ERROR'
      );
    }
  });
  return router;
}
