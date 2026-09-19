/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.login_throttles`: keyed login-failure windows. Keys are HMAC values, never emails or addresses.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const loginThrottlesSchema = {
  dbSchema: 'admin',
  table: 'login_throttles',
  columns: [
    { name: 'key_hash', type: 'text', notNull: true, immutable: true },
    { name: 'failures', type: 'integer', notNull: true, default: 0 },
    { name: 'window_started_at', type: 'timestamptz', notNull: true },
    { name: 'last_failed_at', type: 'timestamptz', notNull: true },
    { name: 'locked_until', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['key_hash'],
    checks: ['failures >= 0'],
    indexes: [{ columns: ['locked_until'] }, { columns: ['last_failed_at'] }],
  },
};

/** Model for `admin.login_throttles`. Inherits the standard table operations only. */
export class LoginThrottles extends TableModel {
  static schema = loginThrottlesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, loginThrottlesSchema, logger);
  }
}
