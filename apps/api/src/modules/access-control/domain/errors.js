/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** SQLSTATE codes treated as a transient write conflict rather than a failure. */
const CONFLICT_SQLSTATES = new Set(['40001', '40P01']);

/**
 * Codes a caller may see unchanged: `access-control`'s own rule codes
 * (M0003 §10) plus the shared codes the route layer and its collaborators
 * report.
 */
const PASS_THROUGH = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'ROLE_IMMUTABLE',
  'STALE_REVISION',
  'GRANT_EXCEEDS_ACTOR',
  'NOT_MEMBER',
  'LAST_ADMIN',
  'CELL_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);

/**
 * Error carrying one stable `access-control` code. Never carries database
 * detail — callers report `code` and nothing else.
 */
export class AccessControlError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Run `operation` and translate its failures into an `AccessControlError`.
 * A known code passes through; a serialization failure or deadlock becomes
 * `CONFLICT`; anything else becomes `INTERNAL_ERROR`, so database structure
 * never reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AccessControlError}
 */
export async function withAccessControlErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AccessControlError) throw error;
    const code = error?.code;
    if (typeof code === 'string' && PASS_THROUGH.has(code))
      throw new AccessControlError(code);
    throw new AccessControlError(
      CONFLICT_SQLSTATES.has(code) ? 'CONFLICT' : 'INTERNAL_ERROR'
    );
  }
}
