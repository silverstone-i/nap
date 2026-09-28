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
import { requireCapability } from '../../../../capability/requireCapability.js';
import { requestAuthority } from '../../domain/authorization.js';
import {
  assertAccountDeactivationAllowed,
  assertMembershipDeactivationAllowed,
} from '../../../access-control/domain/accountEligibility.js';
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

/** Admin-tenancy routes target the Napsoft tenant (I0005-R003). */
const NAPSOFT = { target: 'napsoft' };

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
 * Portal users are platform-level logins, so every route requires a `NAP`
 * capability (I0005-R003).
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {{throttleSecret: string, memoryKib: number, timeCost: number, parallelism: number}} context.authenticationPolicy
 * @returns {import('express').Router}
 */
export function createAccountsRouter({ admin, authenticationPolicy, runtime }) {
  const router = Router();
  const hashingPolicy = {
    memoryKib: authenticationPolicy?.memoryKib,
    timeCost: authenticationPolicy?.timeCost,
    parallelism: authenticationPolicy?.parallelism,
  };

  router.post(
    '/users',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        const user = await createOrReuseUser(
          admin.db,
          write,
          hashingPolicy,
          request.body,
          request.get('Idempotency-Key'),
          {
            requestId: request.requestId,
            assertDeactivationAllowed: membership =>
              assertMembershipDeactivationAllowed(
                admin.db,
                runtime,
                membership
              ),
          }
        );
        sendData(response, user, 201);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.get(
    '/users',
    requireSession(),
    requireCapability('admin-tenancy::accounts::read', NAPSOFT),
    async (request, response) => {
      try {
        const read = requestAuthority(request);
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
    }
  );

  router.get(
    '/users/:id',
    requireSession(),
    requireCapability('admin-tenancy::accounts::read', NAPSOFT),
    async (request, response) => {
      try {
        const read = requestAuthority(request);
        const user = await getUser(admin.db, read.scope, request.params.id);
        sendData(response, user);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.patch(
    '/users/:id',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        const user = await updateUser(
          admin.db,
          write,
          request.params.id,
          request.body,
          {
            requestId: request.requestId,
            assertDeactivationAllowed: userId =>
              assertAccountDeactivationAllowed(admin.db, runtime, userId),
          }
        );
        sendData(response, user);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.delete(
    '/users/:id',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        await archiveUser(admin.db, write, request.params.id, {
          requestId: request.requestId,
          assertDeactivationAllowed: userId =>
            assertAccountDeactivationAllowed(admin.db, runtime, userId),
        });
        sendNoContent(response);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.post(
    '/users/:id/restore',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        const user = await restoreUser(admin.db, write, request.params.id, {
          requestId: request.requestId,
        });
        sendData(response, user);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.post(
    '/memberships',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
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
    }
  );

  router.patch(
    '/memberships/:id',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        const membership = await updateMembership(
          admin.db,
          write,
          request.params.id,
          request.body,
          {
            requestId: request.requestId,
            assertDeactivationAllowed: membership =>
              assertMembershipDeactivationAllowed(
                admin.db,
                runtime,
                membership
              ),
          }
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
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
        await archiveMembership(admin.db, write, request.params.id, {
          requestId: request.requestId,
          assertDeactivationAllowed: membership =>
            assertMembershipDeactivationAllowed(admin.db, runtime, membership),
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
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
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

  router.get(
    '/jobs/:id',
    requireSession(),
    requireCapability('admin-tenancy::accounts::read', NAPSOFT),
    async (request, response) => {
      try {
        const read = requestAuthority(request);
        const job = await getJob(admin.db, read.scope, request.params.id);
        sendData(response, job);
      } catch (error) {
        sendAccountError(response, error);
      }
    }
  );

  router.post(
    '/jobs/:id/retry',
    requireSession(),
    requireCapability('admin-tenancy::accounts::write', NAPSOFT),
    async (request, response) => {
      try {
        const write = requestAuthority(request);
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
