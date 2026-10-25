/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { transportVersion } from '@nap/shared';

/**
 * HTTP status for each stable API error code. A code absent here is a
 * programming error and is reported as `INTERNAL_ERROR`.
 */
export const ERROR_STATUS = Object.freeze({
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INVALID_STATE: 409,
  // M0003 §10 role and assignment rules.
  ROLE_IMMUTABLE: 409,
  STALE_REVISION: 409,
  NOT_MEMBER: 409,
  LAST_ADMIN: 409,
  ADMIN_ASSIGNED: 409,
  ROOT_IMMUTABLE: 409,
  GRANT_EXCEEDS_ACTOR: 403,
  // M0005 §10 directory rules.
  PRIMARY_TAX_CONTACT: 409,
  BULK_FAILED: 409,
  // M0006-02 §10 storage rules.
  STORAGE_NOT_CONFIGURED: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  STORAGE_TEST_FAILED: 422,
  THROTTLED: 429,
  INTERNAL_ERROR: 500,
  AUDIT_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
  CELL_UNAVAILABLE: 503,
  STORAGE_UNAVAILABLE: 503,
});

/**
 * Public message for each error code. Every message is a fixed sentence: it
 * never names a record, a configuration setting, a database object, or a
 * credential, so an error envelope cannot become an oracle.
 */
export const ERROR_MESSAGE = Object.freeze({
  INVALID_INPUT: 'Invalid request',
  UNAUTHENTICATED: 'Not authenticated',
  FORBIDDEN: 'Forbidden',
  PASSWORD_CHANGE_REQUIRED: 'Password change required',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  IDEMPOTENCY_CONFLICT: 'Idempotency key conflict',
  INVALID_STATE: 'Invalid state',
  ROLE_IMMUTABLE: 'Role cannot be changed',
  STALE_REVISION: 'Record has changed',
  NOT_MEMBER: 'User is not an active member',
  LAST_ADMIN: 'Last administrator cannot be removed',
  ADMIN_ASSIGNED: 'Administrator role must be removed first',
  ROOT_IMMUTABLE: 'Root user cannot be changed',
  GRANT_EXCEEDS_ACTOR: 'Grant exceeds your access',
  PRIMARY_TAX_CONTACT: 'Primary tax contact cannot be removed',
  BULK_FAILED: 'One or more items failed; nothing was changed',
  STORAGE_NOT_CONFIGURED: 'File storage is not connected',
  STORAGE_TEST_FAILED: 'File storage connection test failed',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  THROTTLED: 'Too many requests',
  INTERNAL_ERROR: 'Internal error',
  AUDIT_UNAVAILABLE: 'Service unavailable',
  SERVICE_UNAVAILABLE: 'Service unavailable',
  CELL_UNAVAILABLE: 'Service unavailable',
  STORAGE_UNAVAILABLE: 'File storage is unavailable',
});

/**
 * Build the success envelope every API route returns.
 * @param {unknown} data Response payload, already reduced to safe fields.
 * @returns {{version: number, data: unknown}}
 */
export function successEnvelope(data) {
  return { version: transportVersion, data };
}

/**
 * Build the error envelope every API route returns.
 * @param {string} code A key of `ERROR_STATUS`; anything else becomes `INTERNAL_ERROR`.
 * @returns {{version: number, error: {code: string, message: string}}}
 */
export function errorEnvelope(code) {
  const known = Object.hasOwn(ERROR_STATUS, code) ? code : 'INTERNAL_ERROR';
  return {
    version: transportVersion,
    error: { code: known, message: ERROR_MESSAGE[known] },
  };
}

/**
 * Send a success envelope with `Cache-Control: no-store`, so a session view
 * is never held by a shared cache or a browser's back/forward cache.
 * @param {import('express').Response} response
 * @param {unknown} data
 * @param {number} [status=200]
 * @returns {void}
 */
export function sendData(response, data, status = 200) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(status).json(successEnvelope(data));
}

/**
 * Send an empty success response with `Cache-Control: no-store`.
 * @param {import('express').Response} response
 * @returns {void}
 */
export function sendNoContent(response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(204).end();
}

/**
 * Send `409 BULK_FAILED` naming each failed item of an all-or-nothing bulk
 * request and its single-item code (M0005-R030, M0003-R018, I0002-R013).
 * @param {import('express').Response} response
 * @param {{id: string, code: string}[]} details
 * @returns {void}
 */
export function sendBulkFailed(response, details) {
  const body = errorEnvelope('BULK_FAILED');
  body.error.details = details;
  response.setHeader('Cache-Control', 'no-store');
  response.status(ERROR_STATUS.BULK_FAILED).json(body);
}

/**
 * Send `409 CONFLICT` naming the archived record that already holds the
 * unique value, so the screen can link to it (I0011-R010).
 * @param {import('express').Response} response
 * @param {{id: string, archived: true}} details
 * @returns {void}
 */
export function sendConflict(response, details) {
  const body = errorEnvelope('CONFLICT');
  body.error.details = details;
  response.setHeader('Cache-Control', 'no-store');
  response.status(ERROR_STATUS.CONFLICT).json(body);
}

/**
 * Send `422 STORAGE_TEST_FAILED` with the one reason the connection test
 * failed (M0006-02-R004).
 * @param {import('express').Response} response
 * @param {'UNREACHABLE'|'ACCESS_DENIED'|'BUCKET_NOT_FOUND'|'UNEXPECTED_RESPONSE'} reason
 * @returns {void}
 */
export function sendStorageTestFailed(response, reason) {
  const body = errorEnvelope('STORAGE_TEST_FAILED');
  body.error.reason = reason;
  response.setHeader('Cache-Control', 'no-store');
  response.status(ERROR_STATUS.STORAGE_TEST_FAILED).json(body);
}

/**
 * Send an error envelope with its mapped status.
 * @param {import('express').Response} response
 * @param {string} code A key of `ERROR_STATUS`.
 * @param {Record<string, string>} [headers] Extra headers, such as `Retry-After`.
 * @returns {void}
 */
export function sendError(response, code, headers = {}) {
  const body = errorEnvelope(code);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers))
    response.setHeader(name, value);
  response.status(ERROR_STATUS[body.error.code]).json(body);
}
