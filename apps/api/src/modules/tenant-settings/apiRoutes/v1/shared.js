/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ERROR_STATUS, sendError } from '../../../../framework/envelope.js';
import { SettingsError } from '../../domain/errors.js';
import { settingsChangeRecorder } from '../../domain/events.js';

/**
 * Report a settings failure through the shared error envelope. A code the
 * envelope does not know becomes `INTERNAL_ERROR`.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendSettingsError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the domain context for a request. A capability route takes the
 * tenant and actor from `requireCapability`'s decision; a session-only
 * route, such as `GET /effective`, takes them from the session (R008).
 * @param {import('express').Request} request
 * @param {{runtime?: {cellFor: Function}}} deps
 * @returns {Promise<import('../../domain/shared.js').SettingsContext>}
 * @throws {SettingsError} `CELL_UNAVAILABLE`
 */
export async function settingsContext(request, { runtime }) {
  const { session, authorization } = request;
  if (!runtime || !session?.tenant) throw new SettingsError('CELL_UNAVAILABLE');
  const tenantId = authorization?.targetTenant?.id ?? session.tenant;
  const actorId = authorization?.actorId ?? session.user;
  const cell = await runtime.cellFor(session);
  return {
    cell,
    tenant: { id: tenantId },
    actorId,
    record: settingsChangeRecorder(cell, {
      tenantId,
      actorId,
      sessionId: session.id ?? null,
      requestId: request.requestId ?? null,
    }),
  };
}
