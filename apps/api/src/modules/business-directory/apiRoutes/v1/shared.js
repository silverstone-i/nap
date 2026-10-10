/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ERROR_STATUS, sendError } from '../../../../framework/envelope.js';
import { authorize } from '../../../../capability/authorize.js';
import { roleChangeRecorder } from '../../../access-control/domain/events.js';
import { DirectoryError } from '../../domain/errors.js';
import { directoryChangeRecorder } from '../../domain/events.js';
import { createTaxIdProtector } from '../../domain/taxIds.js';

/** One protector per key set, built on first use. */
const protectors = new WeakMap();

/**
 * Report a directory failure through the shared error envelope. A code the
 * envelope does not know becomes `INTERNAL_ERROR`.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendDirectoryError(response, error) {
  const code = error?.code;
  sendError(
    response,
    typeof code === 'string' && Object.hasOwn(ERROR_STATUS, code)
      ? code
      : 'INTERNAL_ERROR'
  );
}

/**
 * Build the domain context for a request `requireCapability` permitted.
 * `can` decides a further capability the same way the route guard did, for
 * rules that depend on the request body, such as `tax-ids::write`
 * (M0005-R012).
 * @param {import('express').Request} request
 * @param {{runtime?: {cellFor: Function}, taxIdPolicy?: {encryptionKey: Buffer, hashKey: string}, authenticationPolicy?: {memoryKib: number, timeCost: number, parallelism: number}}} deps
 * @returns {Promise<import('../../domain/shared.js').DirectoryContext>}
 * @throws {DirectoryError} `CELL_UNAVAILABLE`, `SERVICE_UNAVAILABLE`
 */
export async function directoryContext(
  request,
  { runtime, taxIdPolicy, authenticationPolicy }
) {
  const { session, authorization } = request;
  const { targetTenant: tenant, actorId } = authorization;
  if (!runtime) throw new DirectoryError('CELL_UNAVAILABLE');
  if (!taxIdPolicy) throw new DirectoryError('SERVICE_UNAVAILABLE');
  let taxIds = protectors.get(taxIdPolicy);
  if (!taxIds) {
    taxIds = createTaxIdProtector(taxIdPolicy);
    protectors.set(taxIdPolicy, taxIds);
  }
  const cell = await runtime.cellFor(session);
  return {
    cell,
    tenant: { id: tenant.id, isNapsoft: tenant.is_napsoft === true },
    actorId,
    hashingPolicy: authenticationPolicy
      ? {
          memoryKib: authenticationPolicy.memoryKib,
          timeCost: authenticationPolicy.timeCost,
          parallelism: authenticationPolicy.parallelism,
        }
      : undefined,
    taxIds,
    can: async capability =>
      (
        await authorize(request.app.locals.authorization, session, capability, {
          params: request.params,
        })
      ).decision === 'permit',
    record: directoryChangeRecorder(cell, {
      tenantId: tenant.id,
      actorId,
      sessionId: session.id ?? null,
      requestId: request.requestId ?? null,
    }),
    // I0010: a person's roles are set in the same save.
    homeTenantId: authorization.homeTenant?.id ?? null,
    napsoftCode: authorization.napsoftCode ?? null,
    actorPatterns: async () => authorization.patterns ?? [],
    recordRole: roleChangeRecorder(cell, {
      tenantId: tenant.id,
      actorId,
      sessionId: session.id ?? null,
      requestId: request.requestId ?? null,
    }),
  };
}
