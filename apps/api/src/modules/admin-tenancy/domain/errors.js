/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** SQLSTATE codes treated as a transient write conflict rather than a failure. */
const CONFLICT_SQLSTATES = new Set(['40001', '40P01']);

/**
 * Error carrying one of the stable `admin-tenancy` access codes:
 * `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, or `INTERNAL_ERROR`. Never carries
 * database detail — callers report `code` and nothing else.
 */
export class AdminAccessError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminAccessError`.
 *
 * An `AdminAccessError` thrown by `operation` (an authorization or validation
 * decision) passes through unchanged. Any other thrown value is assumed to be
 * a database driver error: a serialization failure or deadlock (SQLSTATE
 * `40001`/`40P01`) becomes `CONFLICT`; everything else becomes
 * `INTERNAL_ERROR`, discarding the original message, detail, and constraint
 * name so database structure never reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminAccessError}
 */
export async function withDatabaseErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminAccessError) throw error;
    throw new AdminAccessError(
      CONFLICT_SQLSTATES.has(error?.code) ? 'CONFLICT' : 'INTERNAL_ERROR'
    );
  }
}

/**
 * Error carrying one of the stable `admin-tenancy` event codes:
 * `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_ERROR`, or
 * `AUDIT_UNAVAILABLE`. Never carries database detail — callers report `code`
 * and nothing else. Kept separate from `AdminAccessError` because an event
 * that cannot be stored must roll its source transaction back, and no access
 * code carries that meaning.
 */
export class AdminEventError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminEventError`.
 *
 * An `AdminEventError` thrown by `operation` passes through unchanged. Any
 * other thrown value is assumed to be a database driver error: a serialization
 * failure or deadlock (SQLSTATE `40001`/`40P01`) becomes `CONFLICT`, and
 * everything else becomes `fallback`, discarding the original message, detail,
 * and constraint name so database structure never reaches a caller. An append
 * passes `AUDIT_UNAVAILABLE`, since a source transaction must roll back rather
 * than commit an unrecorded mutation; a read passes `INTERNAL_ERROR`.
 * @template T
 * @param {() => Promise<T>} operation
 * @param {'AUDIT_UNAVAILABLE'|'INTERNAL_ERROR'} fallback
 * @returns {Promise<T>}
 * @throws {AdminEventError}
 */
export async function withEventErrors(operation, fallback) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminEventError) throw error;
    throw new AdminEventError(
      CONFLICT_SQLSTATES.has(error?.code) ? 'CONFLICT' : fallback
    );
  }
}

/** Stable codes a session operation may report. Anything else becomes `INTERNAL_ERROR`. */
const SESSION_CODES = new Set([
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'AUDIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` session codes:
 * `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
 * `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, or `INTERNAL_ERROR`. Never
 * carries database detail, a session token, or a token hash.
 *
 * Kept separate from `AdminAccessError` because a session operation
 * distinguishes an unauthenticated caller from a forbidden one, and no access
 * code carries that meaning.
 */
export class AdminSessionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminSessionError`.
 *
 * A session, access, event, or cache error already carrying a session code
 * keeps that code, so an unavailable event store still reports
 * `AUDIT_UNAVAILABLE` and an unavailable revision store still reports
 * `SERVICE_UNAVAILABLE`. Any other thrown value is assumed to be a database
 * driver error: a serialization failure or deadlock (SQLSTATE `40001`/`40P01`)
 * becomes `CONFLICT`; everything else becomes `INTERNAL_ERROR`, discarding the
 * original message, detail, and constraint name.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminSessionError}
 */
export async function withSessionErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminSessionError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminSessionError('CONFLICT');
    throw new AdminSessionError(
      SESSION_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}
