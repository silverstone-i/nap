/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export class MaintenanceError extends Error {
  constructor(code, setting) {
    super(code);
    this.code = code;
    this.setting = setting;
  }
}
export function requireCondition(condition, code = 'INVALID_STATE', setting) {
  if (!condition) throw new MaintenanceError(code, setting);
}
