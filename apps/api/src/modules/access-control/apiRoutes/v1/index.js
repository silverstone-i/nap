/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import { requireCapability } from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  archiveRole,
  archiveRoles,
  assignRole,
  createRole,
  getRole,
  listCapabilities,
  listRoles,
  membershipRoles,
  removeRole,
  restoreRole,
  restoreRoles,
  updateRole,
} from '../../domain/roles.js';
import { accessControlContext, sendAccessControlError } from './shared.js';

const READ = 'access-control::roles::read';
const WRITE = 'access-control::roles::write';
const ASSIGN = 'access-control::assignments::write';

/**
 * Wrap a handler: require a session and `capability` (I0005-R001), build the
 * access-control context, and report failures through the error envelope.
 * @param {object} deps Route context (`admin`, `runtime`).
 * @param {string} capability
 * @param {(context: object, request: import('express').Request, response: import('express').Response) => Promise<void>} handler
 * @returns {import('express').RequestHandler[]}
 */
function route(deps, capability, handler) {
  return [
    requireSession(),
    requireCapability(capability),
    async (request, response) => {
      try {
        const context = await accessControlContext(request, deps);
        await handler(context, request, response);
      } catch (error) {
        sendAccessControlError(response, error);
      }
    },
  ];
}

/**
 * Build the `capabilities` router: the capability catalogue (M0003 §10).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createCapabilitiesRouter(deps) {
  const router = Router();
  router.get(
    '/',
    ...route(deps, READ, async (context, _request, response) =>
      sendData(response, listCapabilities(context))
    )
  );
  return router;
}

/**
 * Build the `roles` router: the selected tenant's roles (M0003 §10).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createRolesRouter(deps) {
  const router = Router();
  router.get(
    '/',
    ...route(deps, READ, async (context, request, response) =>
      sendData(response, await listRoles(context, request.query))
    )
  );
  router.get(
    '/:id',
    ...route(deps, READ, async (context, request, response) =>
      sendData(response, await getRole(context, request.params.id))
    )
  );
  router.post(
    '/',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(response, await createRole(context, request.body), 201)
    )
  );
  router.patch(
    '/:id',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await updateRole(context, request.params.id, request.body)
      )
    )
  );
  // M0003-R018: all-or-nothing bulk archive and restore.
  router.post(
    '/archive',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(response, await archiveRoles(context, request.body))
    )
  );
  router.post(
    '/restore',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(response, await restoreRoles(context, request.body))
    )
  );
  router.post(
    '/:id/archive',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await archiveRole(context, request.params.id, request.body)
      )
    )
  );
  router.post(
    '/:id/restore',
    ...route(deps, WRITE, async (context, request, response) =>
      sendData(
        response,
        await restoreRole(context, request.params.id, request.body)
      )
    )
  );
  return router;
}

/**
 * Build the `memberships` router: each membership's role assignments
 * (M0003 §10, I0012-R013).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createMembershipsRouter(deps) {
  const router = Router();
  router.get(
    '/:membershipId/roles',
    ...route(deps, READ, async (context, request, response) =>
      sendData(
        response,
        await membershipRoles(context, request.params.membershipId)
      )
    )
  );
  router.put(
    '/:membershipId/roles/:roleId',
    ...route(deps, ASSIGN, async (context, request, response) =>
      sendData(
        response,
        await assignRole(
          context,
          request.params.membershipId,
          request.params.roleId
        )
      )
    )
  );
  router.delete(
    '/:membershipId/roles/:roleId',
    ...route(deps, ASSIGN, async (context, request, response) =>
      sendData(
        response,
        await removeRole(
          context,
          request.params.membershipId,
          request.params.roleId
        )
      )
    )
  );
  return router;
}

/**
 * Version 1 route registrations for `access-control`, mounted at
 * `/api/access-control/v1/<router>` against the selected tenant's cell.
 */
export const accessControlRoutesV1 = [
  { router: 'capabilities', factory: createCapabilitiesRouter },
  { router: 'roles', factory: createRolesRouter },
  { router: 'memberships', factory: createMembershipsRouter },
].map(entry => ({
  module: 'access-control',
  version: 1,
  database: 'cell',
  ...entry,
}));
