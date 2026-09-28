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
import { requireCapability } from '../../../../capability/requireCapability.js';
import {
  buildControlAuthority,
  executeProvisionCommand,
  getCellReadiness,
  getOverview,
  registerCell,
} from '../../domain/cells.js';

/** Admin-tenancy routes target the Napsoft tenant (I0005-R003). */
const NAPSOFT = { target: 'napsoft' };

/**
 * Report a control failure through the shared error envelope.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
function sendControlError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the `control` router: cell registration, retry, disable, overview,
 * and readiness. See docs/architecture/admin-cells.md and
 * docs/PRDs/modules/M0001-admin-tenancy/M0001-06-cell-management.md.
 *
 * Cells are records Napsoft manages, so every route requires a `NAP`
 * capability (I0005-R003).
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {'dev'|'test'|'prod'} context.environment The running API's own configured environment.
 * @param {{readiness: Function, markDisabled: Function}} [context.runtime] Runtime cell registry (I0003-R020, R021).
 * @returns {import('express').Router}
 */
export function createControlRouter({ admin, environment, runtime }) {
  const router = Router();

  router.post(
    '/registry',
    requireSession(),
    requireCapability('admin-tenancy::control::write', NAPSOFT),
    async (request, response) => {
      try {
        const authority = buildControlAuthority(request.authorization);
        const result = await registerCell(
          admin.db,
          environment,
          authority,
          request.body,
          { requestId: request.requestId }
        );
        sendData(response, result, 201);
      } catch (error) {
        sendControlError(response, error);
      }
    }
  );

  router.post(
    '/provision',
    requireSession(),
    requireCapability('admin-tenancy::control::write', NAPSOFT),
    async (request, response) => {
      try {
        const authority = buildControlAuthority(request.authorization);
        const result = await executeProvisionCommand(
          admin.db,
          authority,
          request.body,
          { requestId: request.requestId }
        );
        // I0003-R021: a disabled cell stops serving at once, not at restart.
        if (request.body?.operation === 'cell-disable')
          runtime?.markDisabled(request.body.cell);
        sendData(response, result);
      } catch (error) {
        sendControlError(response, error);
      }
    }
  );

  router.get(
    '/overview',
    requireSession(),
    requireCapability('admin-tenancy::control::read', NAPSOFT),
    async (request, response) => {
      try {
        const authority = buildControlAuthority(request.authorization);
        const result = await getOverview(admin.db, authority, {
          cursor: request.query.cursor,
          limit:
            request.query.limit === undefined
              ? undefined
              : Number(request.query.limit),
        });
        sendData(response, result);
      } catch (error) {
        sendControlError(response, error);
      }
    }
  );

  router.get(
    '/cell-readiness',
    requireSession(),
    requireCapability('admin-tenancy::control::read', NAPSOFT),
    async (request, response) => {
      try {
        const authority = buildControlAuthority(request.authorization);
        const result = await getCellReadiness(
          admin.db,
          authority,
          request.query.cell,
          { runtime }
        );
        sendData(response, result);
      } catch (error) {
        sendControlError(response, error);
      }
    }
  );

  return router;
}
