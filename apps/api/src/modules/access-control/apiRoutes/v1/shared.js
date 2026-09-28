/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ERROR_STATUS, sendError } from '../../../../framework/envelope.js';
import { capabilityCatalogue } from '../../domain/catalogue.js';
import { AccessControlError } from '../../domain/errors.js';
import { roleChangeRecorder } from '../../domain/events.js';

/**
 * Report an access-control failure through the shared error envelope. A
 * code the envelope does not know becomes `INTERNAL_ERROR`.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendAccessControlError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the domain context for a request `requireCapability` permitted. The
 * target tenant is the session's selected tenant, and the actor's own
 * patterns, used by the no-escalation rule (M0003-R011), are the resolved
 * set the decision already read from the actor's home tenant.
 * @param {import('express').Request} request
 * @param {{runtime?: {cellFor: Function}}} deps
 * @returns {Promise<import('../../domain/roles.js').AccessControlContext>}
 * @throws {AccessControlError} `CELL_UNAVAILABLE`
 */
export async function accessControlContext(request, { runtime }) {
  const { session, authorization } = request;
  const { targetTenant: tenant, actorId, patterns } = authorization;
  if (!runtime) throw new AccessControlError('CELL_UNAVAILABLE');
  const cell = await runtime.cellFor(session);
  return {
    cell,
    tenant: {
      id: tenant.id,
      code: tenant.tenant_code,
      isNapsoft: tenant.is_napsoft === true,
    },
    napsoftCode: authorization.napsoftCode,
    actorId,
    catalogue: capabilityCatalogue(),
    actorPatterns: async () => patterns,
    record: roleChangeRecorder(cell, {
      tenantId: tenant.id,
      actorId,
      sessionId: session.id ?? null,
      requestId: request.requestId ?? null,
    }),
  };
}
