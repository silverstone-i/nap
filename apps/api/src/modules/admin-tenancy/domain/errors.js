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

/** Stable codes a bootstrap operation may report. Anything else becomes `INTERNAL_ERROR`. */
const BOOTSTRAP_CODES = new Set([
  'INVALID_INPUT',
  'TENANT_CONFLICT',
  'ROOT_CONFLICT',
  'MEMBERSHIP_CONFLICT',
  'CONFLICT',
  'AUDIT_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` bootstrap codes:
 * `INVALID_INPUT`, `TENANT_CONFLICT`, `ROOT_CONFLICT`, `MEMBERSHIP_CONFLICT`,
 * `CONFLICT`, `AUDIT_UNAVAILABLE`, or `INTERNAL_ERROR`. Never carries a
 * password, a password hash, or database detail.
 *
 * The three `*_CONFLICT` codes are business outcomes M0001-02-R004 requires:
 * a caller catches them to roll back and report `conflict` rather than
 * letting them surface as an unhandled failure.
 */
export class AdminBootstrapError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminBootstrapError`.
 *
 * An access, event, or bootstrap error already carrying a bootstrap code keeps
 * that code. Any other thrown value is assumed to be a database driver error:
 * a serialization failure or deadlock (SQLSTATE `40001`/`40P01`) becomes
 * `CONFLICT`; everything else becomes `INTERNAL_ERROR`, discarding the
 * original message, detail, and constraint name so database structure never
 * reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminBootstrapError}
 */
export async function withBootstrapErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminBootstrapError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminBootstrapError('CONFLICT');
    throw new AdminBootstrapError(
      BOOTSTRAP_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}

/** Stable codes a control operation may report. Anything else becomes `INTERNAL_ERROR`. */
const CONTROL_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'AUDIT_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` control codes:
 * `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`,
 * `AUDIT_UNAVAILABLE`, or `INTERNAL_ERROR`. Never carries database detail, a
 * connection string, or a provider secret.
 *
 * Kept separate from `AdminAccessError` because only a cell-provisioning
 * operation reports `INVALID_STATE`, for a transition the current stage or
 * status does not permit.
 */
export class AdminControlError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminControlError`.
 *
 * An access, event, or control error already carrying a control code keeps
 * that code. Any other thrown value is assumed to be a database driver error:
 * a serialization failure or deadlock (SQLSTATE `40001`/`40P01`) becomes
 * `CONFLICT`; everything else becomes `INTERNAL_ERROR`, discarding the
 * original message, detail, and constraint name so database structure never
 * reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminControlError}
 */
export async function withControlErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminControlError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminControlError('CONFLICT');
    throw new AdminControlError(
      CONTROL_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}

/** Stable codes a tenant operation may report. Anything else becomes `INTERNAL_ERROR`. */
const TENANT_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'AUDIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` tenant codes:
 * `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`,
 * `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, or `INTERNAL_ERROR`. Never
 * carries database detail. `SERVICE_UNAVAILABLE` passes through a
 * `CacheConsistencyError` from an unavailable revision store, matching the
 * session and authentication domains.
 *
 * Kept separate from `AdminAccessError` because only tenant creation reports
 * `IDEMPOTENCY_CONFLICT`, for an `Idempotency-Key` reused with a different
 * payload than the attempt it originally recorded.
 */
export class AdminTenantError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminTenantError`.
 *
 * An access, event, or tenant error already carrying a tenant code keeps that
 * code. Any other thrown value is assumed to be a database driver error: a
 * serialization failure or deadlock (SQLSTATE `40001`/`40P01`) becomes
 * `CONFLICT`; everything else becomes `INTERNAL_ERROR`, discarding the
 * original message, detail, and constraint name so database structure never
 * reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminTenantError}
 */
export async function withTenantErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminTenantError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminTenantError('CONFLICT');
    throw new AdminTenantError(
      TENANT_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}

/** Stable codes an account operation may report. Anything else becomes `INTERNAL_ERROR`. */
const ACCOUNT_CODES = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'IDEMPOTENCY_CONFLICT',
  'AUDIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` account codes:
 * `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `INVALID_STATE`,
 * `IDEMPOTENCY_CONFLICT`, `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, or
 * `INTERNAL_ERROR`. Never carries a password, a password hash, or database
 * detail.
 *
 * Kept separate from `AdminTenantError` and `AdminControlError` because a
 * portal-user or membership operation needs both `NOT_FOUND` (control lacks)
 * and `IDEMPOTENCY_CONFLICT` (control lacks), together (tenant lacks
 * `NOT_FOUND`/`INVALID_STATE`).
 */
export class AdminAccountError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminAccountError`.
 *
 * An access, event, session, or account error already carrying an account
 * code keeps that code, so a Napsoft-scoped `NOT_FOUND` or an unavailable
 * event store's `AUDIT_UNAVAILABLE` survive unchanged. Any other thrown value
 * is assumed to be a database driver error: a serialization failure or
 * deadlock (SQLSTATE `40001`/`40P01`) becomes `CONFLICT`; everything else
 * becomes `INTERNAL_ERROR`, discarding the original message, detail, and
 * constraint name so database structure never reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminAccountError}
 */
export async function withAccountErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminAccountError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminAccountError('CONFLICT');
    throw new AdminAccountError(
      ACCOUNT_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}

/** Stable codes an authentication operation may report. Anything else becomes `INTERNAL_ERROR`. */
const AUTH_CODES = new Set([
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'THROTTLED',
  'CONFLICT',
  'AUDIT_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

/**
 * Error carrying one of the stable `admin-tenancy` authentication codes:
 * `INVALID_INPUT`, `UNAUTHENTICATED`, `FORBIDDEN`, `THROTTLED`, `CONFLICT`,
 * `AUDIT_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, or `INTERNAL_ERROR`. Never
 * carries a password, a password hash, a throttle key, or database detail.
 *
 * Kept separate from `AdminSessionError` because only authentication can
 * report `THROTTLED`, and only a throttled error carries the seconds a caller
 * must wait. `retryAfterSeconds` is `null` for every other code.
 */
export class AdminAuthError extends Error {
  constructor(code, retryAfterSeconds = null) {
    super(code);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Runs `operation` and translates its failures into an `AdminAuthError`.
 *
 * An access, event, session, or authentication error already carrying an
 * authentication code keeps that code and, when it is an `AdminAuthError`, its
 * `retryAfterSeconds`. That is what lets a failed event append surface as
 * `AUDIT_UNAVAILABLE` rather than being flattened into a login rejection. Any
 * other thrown value is assumed to be a database driver error: a serialization
 * failure or deadlock (SQLSTATE `40001`/`40P01`) becomes `CONFLICT`; everything
 * else becomes `INTERNAL_ERROR`, discarding the original message, detail, and
 * constraint name.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {AdminAuthError}
 */
export async function withAuthErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof AdminAuthError) throw error;
    if (CONFLICT_SQLSTATES.has(error?.code))
      throw new AdminAuthError('CONFLICT');
    throw new AdminAuthError(
      AUTH_CODES.has(error?.code) ? error.code : 'INTERNAL_ERROR'
    );
  }
}
