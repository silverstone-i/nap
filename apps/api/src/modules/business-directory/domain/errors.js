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
  'CELL_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
]);

/**
 * Error carrying one stable `business-directory` code. Never carries
 * database detail or a tax ID — callers report `code` and nothing else.
 */
export class DirectoryError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Run `operation` and translate its failures into a `DirectoryError`. A
 * known code passes through; a caller-caused SQLSTATE maps as
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
    const code = error?.code;
    if (typeof code === 'string' && PASS_THROUGH.has(code))
      throw new DirectoryError(code);
    throw new DirectoryError(
      typeof code === 'string' && Object.hasOwn(SQLSTATE_CODES, code)
        ? SQLSTATE_CODES[code]
        : 'INTERNAL_ERROR'
    );
  }
}
