/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** SQLSTATE codes a caller may cause: a serialization failure or deadlock is a conflict. */
const SQLSTATE_CODES = Object.freeze({
  40001: 'CONFLICT',
  '40P01': 'CONFLICT',
});

/** Codes a caller may see unchanged (M0006-01 §10). */
const PASS_THROUGH = new Set([
  'INVALID_INPUT',
  'NOT_FOUND',
  'CONFLICT',
  'STALE_REVISION',
  'CELL_UNAVAILABLE',
]);

/** Error carrying one stable `tenant-settings` code, never database detail. */
export class SettingsError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Run `operation` and translate its failures into a `SettingsError`. A
 * known code passes through; a caller-caused SQLSTATE maps as
 * `SQLSTATE_CODES` says; anything else becomes `INTERNAL_ERROR`.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 * @throws {SettingsError}
 */
export async function withSettingsErrors(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SettingsError) throw error;
    const code = error?.code;
    if (typeof code === 'string' && PASS_THROUGH.has(code))
      throw new SettingsError(code);
    throw new SettingsError(
      typeof code === 'string' && Object.hasOwn(SQLSTATE_CODES, code)
        ? SQLSTATE_CODES[code]
        : 'INTERNAL_ERROR'
    );
  }
}
