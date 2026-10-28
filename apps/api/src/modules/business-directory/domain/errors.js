/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * SQLSTATE codes a caller may cause: a serialization failure, deadlock, or
 * unique violation is a conflict; a foreign key violation means the request
 * named something that does not exist, such as an unknown country code.
 */
const SQLSTATE_CODES = Object.freeze({
  40001: 'CONFLICT',
  '40P01': 'CONFLICT',
  23505: 'CONFLICT',
  23503: 'INVALID_INPUT',
});

/**
 * Unique indexes whose violation is a rule of its own: the party already
 * has this email, phone, or address (M0005-R063, R064).
 */
const CONSTRAINT_CODES = Object.freeze({
  uidx_contact_methods_party_id_type_value: 'DUPLICATE_DETAIL',
  uidx_addresses_party_id_match: 'DUPLICATE_DETAIL',
});

/**
 * Codes a caller may see unchanged: `business-directory`'s own rule codes
 * (M0005 §10) plus the shared codes the route layer and its collaborators
 * report.
 */
const PASS_THROUGH = new Set([
  'INVALID_INPUT',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'INVALID_STATE',
  'STALE_REVISION',
  'PRIMARY_TAX_CONTACT',
  // M0005-R048: names the record already holding the tax ID.
  'DUPLICATE_TAX_ID',
  // M0005-R064: the party already has this email, phone, or address.
  'DUPLICATE_DETAIL',
  'ADMIN_ASSIGNED',
  // I0010-R009: M0003's role rules, reported as Access Control reports them.
  'GRANT_EXCEEDS_ACTOR',
  'LAST_ADMIN',
  'CELL_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);

/**
 * Error carrying one stable `business-directory` code. Never carries
 * database detail or a tax ID — callers report `code` and nothing else.
 */
export class DirectoryError extends Error {
  /**
   * @param {string} code
   * @param {{id: string, archived: boolean}} [details] For `CONFLICT`, the archived record holding the value (I0011-R010); for `DUPLICATE_TAX_ID`, the record holding the tax ID (M0005-R048).
   */
  constructor(code, details) {
    super(code);
    this.code = code;
    if (details) this.details = details;
  }
}

/**
 * A bulk archive or restore in which some items failed (M0005-R030).
 * `details` names each failed item and its single-record error code.
 */
export class BulkFailedError extends DirectoryError {
  /** @param {{id: string, code: string}[]} details */
  constructor(details) {
    super('BULK_FAILED');
    this.details = details;
  }
}

/**
 * The code a caller would see for `error`, as `withDirectoryErrors` maps it.
 * @param {unknown} error
 * @returns {string}
 */
export function directoryCode(error) {
  if (error instanceof DirectoryError) return error.code;
  const code = error?.code;
  if (typeof code === 'string' && PASS_THROUGH.has(code)) return code;
  const constraint = error?.constraint;
  if (
    code === '23505' &&
    typeof constraint === 'string' &&
    Object.hasOwn(CONSTRAINT_CODES, constraint)
  )
    return CONSTRAINT_CODES[constraint];
  return typeof code === 'string' && Object.hasOwn(SQLSTATE_CODES, code)
    ? SQLSTATE_CODES[code]
    : 'INTERNAL_ERROR';
}

/**
 * Run `operation` and translate its failures into a `DirectoryError`. A
 * known code passes through; a violation of an index in `CONSTRAINT_CODES`
 * maps as it says; another caller-caused SQLSTATE maps as
 * `SQLSTATE_CODES` says; anything else becomes `INTERNAL_ERROR`, so database structure
 * never reaches a caller.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {DirectoryError}
 */
export async function withDirectoryErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DirectoryError) throw error;
    throw new DirectoryError(directoryCode(error));
  }
}
