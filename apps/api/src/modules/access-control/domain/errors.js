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
  'ROOT_IMMUTABLE',
  'CELL_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);

/**
 * Error carrying one stable `access-control` code. Never carries database
 * detail — callers report `code` and nothing else.
 */
export class AccessControlError extends Error {
  /**
   * @param {string} code
   * @param {{id: string, archived: true}} [details] For `CONFLICT`, the archived record holding the value (I0011-R010).
   */
  constructor(code, details) {
    super(code);
    this.code = code;
    if (details) this.details = details;
  }
}

/**
 * A bulk archive or restore in which some roles failed (M0003-R018).
 * `details` names each failed role and its single-role error code.
 */
export class AccessControlBulkFailedError extends AccessControlError {
  /** @param {{id: string, code: string}[]} details */
  constructor(details) {
    super('BULK_FAILED');
    this.details = details;
  }
}

/**
 * The code a caller would see for `error`, as `withAccessControlErrors`
 * maps it.
 * @param {unknown} error
 * @returns {string}
 */
export function accessControlCode(error) {
  if (error instanceof AccessControlError) return error.code;
  const code = error?.code;
  if (typeof code === 'string' && PASS_THROUGH.has(code)) return code;
  return CONFLICT_SQLSTATES.has(code) ? 'CONFLICT' : 'INTERNAL_ERROR';
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
    throw new AccessControlError(accessControlCode(error));
  }
}
