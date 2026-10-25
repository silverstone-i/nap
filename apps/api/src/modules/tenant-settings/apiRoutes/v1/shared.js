/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  ERROR_STATUS,
  sendError,
  sendStorageTestFailed,
} from '../../../../framework/envelope.js';
import { SettingsError } from '../../domain/errors.js';
import { settingsChangeRecorder } from '../../domain/events.js';
import { createObjectStore } from '../../domain/objectStore.js';
import { createSecretBox } from '../../domain/secrets.js';

/** One secret box per route context, built on first use. */
const boxes = new WeakMap();

/**
 * The deployment's storage secret box, or null when the API runs without
 * `fileStoragePolicy` (M0006-02-R002).
 * @param {object} deps
 * @returns {{seal: Function, open: Function}|null}
 */
function secretsFor(deps) {
  if (!deps.fileStoragePolicy) return null;
  if (!boxes.has(deps))
    boxes.set(deps, createSecretBox(deps.fileStoragePolicy));
  return boxes.get(deps);
}

/**
 * Report a settings failure through the shared error envelope. A code the
 * envelope does not know becomes `INTERNAL_ERROR`.
 * @param {import('express').Response} response
 * @param {unknown} error
 * @returns {void}
 */
export function sendSettingsError(response, error) {
  const code = error?.code;
  // M0006-02-R004: a failed connection test names its one reason.
  if (code === 'STORAGE_TEST_FAILED' && error.reason) {
    sendStorageTestFailed(response, error.reason);
    return;
  }
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
 * @param {{runtime?: {cellFor: Function}, fileStoragePolicy?: {encryptionKey: Buffer}, objectStoreFactory?: Function}} deps
 * @returns {Promise<import('../../domain/shared.js').SettingsContext>}
 * @throws {SettingsError} `CELL_UNAVAILABLE`
 */
export async function settingsContext(request, deps) {
  const { runtime } = deps;
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
    secrets: secretsFor(deps),
    objectStores: deps.objectStoreFactory ?? createObjectStore,
  };
}
