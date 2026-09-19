/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Error carrying a stable, secret-free code for CLI output and tests.
 * `setting` names the configuration key involved, never its value. Setup
 * paths may attach `created` and `resourceId` to report what a failed run
 * left behind.
 */
export class MaintenanceError extends Error {
  constructor(code, setting) {
    super(code);
    this.code = code;
    this.setting = setting;
  }
}
/**
 * Throw a `MaintenanceError` when a condition is false.
 * @param {unknown} condition
 * @param {string} [code='INVALID_STATE']
 * @param {string} [setting]
 * @returns {void}
 */
export function requireCondition(condition, code = 'INVALID_STATE', setting) {
  if (!condition) throw new MaintenanceError(code, setting);
}
