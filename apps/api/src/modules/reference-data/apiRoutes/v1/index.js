/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';
import { sendData, sendError } from '../../../../framework/envelope.js';
import { requireCapability } from '../../../../capability/requireCapability.js';
import { requireSession } from '../../../../middleware/sessionContext.js';

const READ = 'reference-data::lookups::read';

/**
 * Build a router serving one lookup list from the caller's tenant's cell
 * (M0004-R008). The rows are global to the cell, so no tenant transaction
 * is needed.
 * @param {'countries'|'currencies'} table
 * @returns {(deps: {runtime?: {cellFor: Function}}) => import('express').Router}
 */
function lookupRouter(table) {
  return ({ runtime }) => {
    const router = Router();
    router.get(
      '/',
      requireSession(),
      requireCapability(READ),
      async (request, response) => {
        try {
          if (!runtime) return sendError(response, 'CELL_UNAVAILABLE');
          const cell = await runtime.cellFor(request.session);
          sendData(response, await cell[table].listByName());
        } catch (error) {
          sendError(
            response,
            error?.code === 'CELL_UNAVAILABLE'
              ? 'CELL_UNAVAILABLE'
              : 'INTERNAL_ERROR'
          );
        }
      }
    );
    return router;
  };
}

/**
 * Version 1 route registrations for `reference-data`, mounted at
 * `/api/reference-data/v1/<router>`.
 */
export const referenceDataRoutesV1 = [
  { router: 'countries', factory: lookupRouter('countries') },
  { router: 'currencies', factory: lookupRouter('currencies') },
].map(entry => ({
  module: 'reference-data',
  version: 1,
  database: 'cell',
  ...entry,
}));
