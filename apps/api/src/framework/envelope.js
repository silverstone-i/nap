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
  INVALID_STATE: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  THROTTLED: 429,
  INTERNAL_ERROR: 500,
  AUDIT_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
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
  INVALID_STATE: 'Invalid state',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported media type',
  THROTTLED: 'Too many requests',
  INTERNAL_ERROR: 'Internal error',
  AUDIT_UNAVAILABLE: 'Service unavailable',
  SERVICE_UNAVAILABLE: 'Service unavailable',
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
