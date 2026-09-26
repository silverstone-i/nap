/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import {
  ERROR_STATUS,
  sendData,
  sendNoContent,
  sendError,
} from '../../../../framework/envelope.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  accessScope,
  resolveAuthorization,
} from '../../domain/authorization.js';
import {
  archiveMembership,
  archiveUser,
  createMembership,
  createOrReuseUser,
  getJob,
  getUser,
  listUsers,
  restoreMembership,
  restoreUser,
  retryJob,
  updateMembership,
  updateUser,
} from '../../domain/accounts.js';

/**
 * Report an accounts failure through the shared error envelope.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
function sendAccountError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the `accounts` router: ordinary portal-user and membership
 * administration, and provisioning-job status. See
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-08-portal-user-and-membership-administration.md.
 *
 * `authorization.js` currently resolves only root or no platform authority
 * (I0005's role-based `platform_admin`/`support`/`tenant_admin` remains
 * deferred until the tenant-local role catalogue exists in the cell), so every scope this router
 * builds today is either full access or none — the same posture `tenants.js`
 * and `control.js` document for their own capability checks.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{throttleSecret: string, memoryKib: number, timeCost: number, parallelism: number}} context.authenticationPolicy
 * @returns {import('express').Router}
 */
export function createAccountsRouter({ admin, authenticationPolicy }) {
  const router = Router();
  const hashingPolicy = {
    memoryKib: authenticationPolicy?.memoryKib,
    timeCost: authenticationPolicy?.timeCost,
    parallelism: authenticationPolicy?.parallelism,
  };

  /**
   * Build an `{actorId, scope}` authority for one `admin-tenancy::accounts::*` capability.
   * @param {import('express').Request} request
   * @param {'admin-tenancy::accounts::read'|'admin-tenancy::accounts::write'} capability
   * @returns {Promise<{actorId: string, scope: import('../../domain/scope.js').AdminAccessScope}>}
   */
  async function authority(request, capability) {
    const context = await resolveAuthorization(admin.db, request.session);
    return {
      actorId: context.actorId,
      scope: accessScope(context, capability),
    };
  }

  router.post('/users', requireSession(), async (request, response) => {
    try {
      const write = await authority(request, 'admin-tenancy::accounts::write');
      const user = await createOrReuseUser(
        admin.db,
        write,
        hashingPolicy,
        request.body,
        request.get('Idempotency-Key'),
        { requestId: request.requestId }
      );
      sendData(response, user, 201);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.get('/users', requireSession(), async (request, response) => {
    try {
      const read = await authority(request, 'admin-tenancy::accounts::read');
      const result = await listUsers(admin.db, read, {
        cursor: request.query.cursor,
        limit:
          request.query.limit === undefined
            ? undefined
            : Number(request.query.limit),
      });
      sendData(response, result);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.get('/users/:id', requireSession(), async (request, response) => {
    try {
      const read = await authority(request, 'admin-tenancy::accounts::read');
      const user = await getUser(admin.db, read.scope, request.params.id);
      sendData(response, user);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.patch('/users/:id', requireSession(), async (request, response) => {
    try {
      const write = await authority(request, 'admin-tenancy::accounts::write');
      const user = await updateUser(
        admin.db,
        write,
        request.params.id,
        request.body,
        { requestId: request.requestId }
      );
      sendData(response, user);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.delete('/users/:id', requireSession(), async (request, response) => {
    try {
      const write = await authority(request, 'admin-tenancy::accounts::write');
      await archiveUser(admin.db, write, request.params.id, {
        requestId: request.requestId,
      });
      sendNoContent(response);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.post(
    '/users/:id/restore',
    requireSession(),
    async (request, response) => {
      try {
        const write = await authority(
          request,
          'admin-tenancy::accounts::write'
        );
        const user = await restoreUser(admin.db, write, request.params.id, {
          requestId: request.requestId,
        });
        sendData(response, user);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.post('/memberships', requireSession(), async (request, response) => {
    try {
      const write = await authority(request, 'admin-tenancy::accounts::write');
      const result = await createMembership(
        admin.db,
        write,
        request.body,
        request.get('Idempotency-Key'),
        { requestId: request.requestId }
      );
      sendData(response, result, 201);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.patch(
    '/memberships/:id',
    requireSession(),
    async (request, response) => {
      try {
        const write = await authority(
          request,
          'admin-tenancy::accounts::write'
        );
        const membership = await updateMembership(
          admin.db,
          write,
          request.params.id,
          request.body,
          { requestId: request.requestId }
        );
        sendData(response, membership);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.delete(
    '/memberships/:id',
    requireSession(),
    async (request, response) => {
      try {
        const write = await authority(
          request,
          'admin-tenancy::accounts::write'
        );
        await archiveMembership(admin.db, write, request.params.id, {
          requestId: request.requestId,
        });
        sendNoContent(response);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.post(
    '/memberships/:id/restore',
    requireSession(),
    async (request, response) => {
      try {
        const write = await authority(
          request,
          'admin-tenancy::accounts::write'
        );
        const membership = await restoreMembership(
          admin.db,
          write,
          request.params.id,
          { requestId: request.requestId }
        );
        sendData(response, membership);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.get('/jobs/:id', requireSession(), async (request, response) => {
    try {
      const read = await authority(request, 'admin-tenancy::accounts::read');
      const job = await getJob(admin.db, read.scope, request.params.id);
      sendData(response, job);
    } catch (error) {
      sendAccountError(response, error);
    }
  });

  router.post(
    '/jobs/:id/retry',
    requireSession(),
    async (request, response) => {
      try {
        const write = await authority(
          request,
          'admin-tenancy::accounts::write'
        );
        const job = await retryJob(admin.db, write, request.params.id, {
          requestId: request.requestId,
        });
        sendData(response, job);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  return router;
}
