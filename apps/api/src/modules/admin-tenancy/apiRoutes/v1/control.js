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
import {
  buildControlAuthority,
  executeProvisionCommand,
  getCellReadiness,
  getOverview,
  registerCell,
} from '../../domain/cells.js';

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
 * `authorization.js` currently resolves only root or no platform authority
 * (M0001-05's role-based `platform_admin`/`support` remains deferred), so
 * every scope this router builds today is either full access or none — the
 * support-scoped Napsoft restriction the domain functions already enforce
 * has no caller yet, exactly as M0001-04's `sessions` router notes for
 * session revocation.
 * @param {object} context
 * @param {import('pg-schemata').Database} context.admin
 * @param {'dev'|'test'|'prod'} context.environment The running API's own configured environment.
 * @returns {import('express').Router}
 */
export function createControlRouter({ admin, environment }) {
  const router = Router();

  router.post('/registry', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const authority = buildControlAuthority(
        context,
        'admin-tenancy::control::write'
      );
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
  });

  router.post('/provision', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const authority = buildControlAuthority(
        context,
        'admin-tenancy::control::write'
      );
      const result = await executeProvisionCommand(
        admin.db,
        authority,
        request.body,
        { requestId: request.requestId }
      );
      sendData(response, result);
    } catch (error) {
      sendControlError(response, error);
    }
  });

  router.get('/overview', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const authority = buildControlAuthority(
        context,
        'admin-tenancy::control::read'
      );
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
  });

  router.get('/cell-readiness', requireSession(), async (request, response) => {
    try {
      const context = await resolveAuthorization(admin.db, request.session);
      const authority = buildControlAuthority(
        context,
        'admin-tenancy::control::read'
      );
      const result = await getCellReadiness(
        admin.db,
        authority,
        request.query.cell
      );
      sendData(response, result);
    } catch (error) {
      sendControlError(response, error);
    }
  });

  return router;
}
