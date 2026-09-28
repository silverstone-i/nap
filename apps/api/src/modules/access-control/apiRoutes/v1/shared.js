/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ERROR_STATUS, sendError } from '../../../../framework/envelope.js';
import {
  permits,
  resolveAuthorization,
} from '../../../admin-tenancy/domain/authorization.js';
import { resolvePatterns } from '../../domain/callerPatterns.js';
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
 * The actor's home tenant (I0005 §5): the Napsoft tenant when the actor is an
 * active Napsoft member, otherwise their only active membership's tenant.
 * An actor with several non-Napsoft memberships has no unambiguous home
 * tenant yet and resolves to none.
 * @param {object} admin Admin repository handle.
 * @param {string} actorId
 * @returns {Promise<{id: string, cell_id: string|null}|null>}
 */
async function homeTenant(admin, actorId) {
  const memberships = await admin.portal_user_tenants.findWhere(
    { portal_user_id: actorId, status: 'active' },
    'AND',
    { columnWhitelist: ['tenant_id'] }
  );
  if (memberships.length === 0) return null;
  const tenants = await admin.tenants.findWhere(
    { id: { $in: memberships.map(row => row.tenant_id) } },
    'AND',
    { columnWhitelist: ['id', 'is_napsoft', 'cell_id'] }
  );
  return (
    tenants.find(tenant => tenant.is_napsoft) ??
    (tenants.length === 1 ? tenants[0] : null)
  );
}

/**
 * Authorize one access-control request and build its domain context.
 *
 * Interim authorization until I0005 (step 2.3): the capability is checked
 * against `resolveAuthorization`'s platform capabilities, and I0005's
 * `requireCapability` replaces this one check. The target tenant is the
 * session's selected tenant; a session with none gets `INVALID_STATE`.
 *
 * The actor's own patterns, used by the no-escalation rule (M0003-R011), are
 * read lazily from the actor's home tenant's cell, so read routes never
 * touch a second cell.
 * @param {import('express').Request} request
 * @param {{admin: {db: object}, runtime?: {cellFor: Function, dbFor: Function}}} deps
 * @param {string} capability Route capability, `module::router::action`.
 * @returns {Promise<import('../../domain/roles.js').AccessControlContext>}
 * @throws {AccessControlError} `FORBIDDEN`, `INVALID_STATE`, `CELL_UNAVAILABLE`
 */
export async function accessControlContext(
  request,
  { admin, runtime },
  capability
) {
  const { session } = request;
  const authorization = await resolveAuthorization(admin.db, session);
  if (!permits(authorization, capability))
    throw new AccessControlError('FORBIDDEN');
  if (!session.tenant) throw new AccessControlError('INVALID_STATE');
  const [tenant, napsoft] = await Promise.all([
    admin.db.tenants.findOneBy(
      { id: session.tenant },
      { columnWhitelist: ['id', 'tenant_code', 'is_napsoft'] }
    ),
    admin.db.tenants.findOneBy(
      { is_napsoft: true },
      { columnWhitelist: ['tenant_code'] }
    ),
  ]);
  if (!tenant || !runtime) throw new AccessControlError('CELL_UNAVAILABLE');
  const cell = await runtime.cellFor(session);
  let patterns;
  return {
    cell,
    tenant: {
      id: tenant.id,
      code: tenant.tenant_code,
      isNapsoft: tenant.is_napsoft === true,
    },
    napsoftCode: napsoft?.tenant_code ?? null,
    actorId: authorization.actorId,
    catalogue: capabilityCatalogue(),
    actorPatterns: () => {
      patterns ??= (async () => {
        const home = await homeTenant(admin.db, authorization.actorId);
        if (!home?.cell_id) return [];
        return resolvePatterns(runtime.dbFor(home.cell_id), {
          tenantId: home.id,
          portalUserId: authorization.actorId,
        });
      })();
      return patterns;
    },
    record: roleChangeRecorder(cell, {
      tenantId: tenant.id,
      actorId: authorization.actorId,
      sessionId: session.id ?? null,
      requestId: request.requestId ?? null,
    }),
  };
}
