/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData } from '../../../../framework/envelope.js';
import {
  requireCapability,
  sessionOnly,
} from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';
import {
  getEffective,
  getGeneral,
  updateGeneral,
} from '../../domain/general.js';
import { sendSettingsError, settingsContext } from './shared.js';

const READ = 'tenant-settings::general::read';
const WRITE = 'tenant-settings::general::write';

/**
 * Wrap a handler: build the settings context and report failures through
 * the error envelope.
 * @param {object} deps Route context (`runtime`).
 * @param {(context: object, request: import('express').Request, response: import('express').Response) => Promise<void>} handler
 * @returns {import('express').RequestHandler}
 */
function handle(deps, handler) {
  return async (request, response) => {
    try {
      const context = await settingsContext(request, deps);
      await handler(context, request, response);
    } catch (error) {
      sendSettingsError(response, error);
    }
  };
}

/**
 * Build the `general` router (M0006-01-R005–R007).
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createGeneralRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    requireCapability(READ),
    handle(deps, async (context, request, response) =>
      sendData(response, await getGeneral(context, request.query))
    )
  );
  router.patch(
    '/',
    requireSession(),
    requireCapability(WRITE),
    handle(deps, async (context, request, response) =>
      sendData(response, await updateGeneral(context, request.body))
    )
  );
  return router;
}

/**
 * Build the `effective` router (M0006-01-R008): any member of the selected
 * tenant reads the values to apply.
 * @param {object} deps
 * @returns {import('express').Router}
 */
export function createEffectiveRouter(deps) {
  const router = Router();
  router.get(
    '/',
    requireSession(),
    sessionOnly,
    handle(deps, async (context, request, response) =>
      sendData(response, await getEffective(context, request.query))
    )
  );
  return router;
}

/**
 * Version 1 route registrations for `tenant-settings`, mounted at
 * `/api/tenant-settings/v1/<router>` against the selected tenant's cell.
 */
export const tenantSettingsRoutesV1 = [
  { router: 'general', factory: createGeneralRouter },
  { router: 'effective', factory: createEffectiveRouter },
].map(entry => ({
  module: 'tenant-settings',
  version: 1,
  database: 'cell',
  ...entry,
}));
