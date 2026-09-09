/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored login_throttles record.
 * Used by: the LoginThrottles repository.
 */
export type LoginThrottlesRow = {
  id: string;
  key_hash: string;
  failures: number;
  window_started_at: Date;
  locked_until: Date | null;
} & AuditFields &
  SoftDelete;

/**
 * Does: Declares the columns and constraints of admin.login_throttles.
 * Used by: the LoginThrottles model.
 */
export const login_throttlesSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'login_throttles',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'key_hash',
      type: 'text',
      notNull: true,
    },
    {
      name: 'failures',
      type: 'integer',
      notNull: true,
    },
    {
      name: 'window_started_at',
      type: 'timestamptz',
      notNull: true,
    },
    {
      name: 'locked_until',
      type: 'timestamptz',
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['key_hash']],
    checks: ['failures >= 0'],
  },
};

/**
 * Does: Reads and writes admin.login_throttles through the database library.
 * Called by: the admin repository registry.
 */
export class LoginThrottles extends TableModel<LoginThrottlesRow> {
  /**
   * Does: Binds this model to its transaction or database connection.
   * Called by: the database library when constructing repositories.
   */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, login_throttlesSchema);
  }
  /**
   * Does: Serializes attempts sharing an email or address before checking counters.
   * Called by: authentication services during a request.
   */
  async lockKeys(keys: string[]) {
    for (const key of [...keys].sort())
      await this.db.any(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [key]
      );
  }
  /**
   * Does: Checks whether either login key has an unexpired lock.
   * Called by: authentication services during a request.
   */
  async locked(keys: string[]) {
    const row = await this.db.one<{ locked: boolean }>(
      `SELECT EXISTS (
      SELECT 1 FROM admin.login_throttles WHERE key_hash IN ($1:csv) AND locked_until > clock_timestamp()
    ) AS locked`,
      [keys]
    );
    return row.locked;
  }
  /**
   * Does: Increments a failure counter and starts the fifteenth-minute lock at ten failures.
   * Called by: authentication services during a request.
   */
  async fail(key: string) {
    await this.db.none(
      `DELETE FROM admin.login_throttles WHERE key_hash = $1
      AND window_started_at + interval '15 minutes' <= clock_timestamp()
      AND (locked_until IS NULL OR locked_until <= clock_timestamp())`,
      [key]
    );
    await this.db.none(
      `INSERT INTO admin.login_throttles
      (key_hash, failures, window_started_at, created_by, updated_by)
      VALUES ($1, 1, clock_timestamp(), $2, $2)
      ON CONFLICT (key_hash) DO UPDATE SET
        failures = admin.login_throttles.failures + 1,
        locked_until = CASE WHEN admin.login_throttles.failures + 1 >= 10
          THEN clock_timestamp() + interval '15 minutes' ELSE NULL END,
        updated_by = $2`,
      [key, this._resolveAuditActor()]
    );
  }
  /**
   * Does: Clears a successful login's email counter while retaining its transient row.
   * Called by: authentication services during a request.
   */
  async clearEmail(key: string) {
    await this.db.none(
      `UPDATE admin.login_throttles SET failures = 0,
      window_started_at = clock_timestamp(), locked_until = NULL, updated_by = $2 WHERE key_hash = $1`,
      [key, this._resolveAuditActor()]
    );
  }
}
