/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Thin same-origin fetch wrapper for the BFF's versioned envelope
 * (docs/architecture/bff.md). No retry or backoff logic: a caller decides
 * whether and how to retry.
 */

/**
 * An API failure, carrying the stable error code the BFF returned (or
 * `INTERNAL_ERROR` for a response this client could not even parse).
 */
export class ApiError extends Error {
  /**
   * @param {string} code One of `@nap/shared`'s `apiErrorCodes`.
   * @param {number} status HTTP status.
   * @param {number|null} [retryAfterSeconds] Present only for `THROTTLED`.
   */
  constructor(code, status, retryAfterSeconds = null) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Send one request and unwrap the envelope.
 * @param {string} method
 * @param {string} path Same-origin path, e.g. `/api/admin-tenancy/v1/auth/login`.
 * @param {unknown} [body]
 * @returns {Promise<unknown>} The envelope's `data`, or `null` for a `204`.
 * @throws {ApiError}
 */
async function request(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', 0);
  }

  if (response.status === 204) return null;

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new ApiError('INTERNAL_ERROR', response.status);
  }

  if (envelope?.error) {
    const { code } = envelope.error;
    const retryAfter = response.headers.get('Retry-After');
    throw new ApiError(
      code,
      response.status,
      code === 'THROTTLED' && retryAfter ? Number(retryAfter) : null
    );
  }

  return envelope.data;
}

/** GET `path` and return the envelope's `data`. @param {string} path @returns {Promise<unknown>} */
export const apiGet = path => request('GET', path);
/** POST `body` to `path` and return the envelope's `data`. @param {string} path @param {unknown} [body] @returns {Promise<unknown>} */
export const apiPost = (path, body) => request('POST', path, body);
