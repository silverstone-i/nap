/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored sessions record.
 * Used by: the Sessions repository.
 */
export type SessionsRow = {
  access_mode: string | null;
  effective_user_id: string | null;
  access_reason: string | null;
  id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  deactivated_at: Date | null;
  portal_user_id: string;
  tenant_id: string | null;
  token_hash: string;
  idle_expires_at: Date;
  absolute_expires_at: Date;
  last_seen_at: Date;
};

/**
 * Does: Declares the columns and constraints of admin.sessions.
 * Used by: the Sessions model.
 */
export const sessionsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'sessions',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    { name: 'access_mode', type: 'text' },
    { name: 'effective_user_id', type: 'uuid' },
    { name: 'access_reason', type: 'text' },
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'portal_user_id',
      type: 'uuid',
      notNull: true,
    },
    {
      name: 'tenant_id',
      type: 'uuid',
    },
    {
      name: 'token_hash',
      type: 'text',
      notNull: true,
    },
    {
      name: 'idle_expires_at',
      type: 'timestamptz',
      notNull: true,
    },
    {
      name: 'absolute_expires_at',
      type: 'timestamptz',
      notNull: true,
    },
    {
      name: 'last_seen_at',
      type: 'timestamptz',
      notNull: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['token_hash']],
    indexes: [
      { columns: ['effective_user_id'] },
      {
        columns: ['portal_user_id'],
      },
      {
        columns: ['tenant_id'],
      },
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['effective_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: {
          schema: 'admin',
          table: 'portal_users',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
  },
};

/**
 * Does: Reads and writes admin.sessions through the database library.
 * Called by: the admin repository registry.
 */
export class Sessions extends TableModel<SessionsRow> {
  /**
   * Does: Binds this model to its transaction or database connection.
   * Called by: the database library when constructing repositories.
   */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, sessionsSchema);
  }
  /**
   * Does: Loads a session reference, including expired or revoked rows.
   * Called by: authentication services during a request.
   */
  async reference(id: string) {
    return this.db.oneOrNone<SessionsRow>(
      'SELECT * FROM admin.sessions WHERE id = $1',
      [id]
    );
  }
  /**
   * Does: Extends a still-valid session without exceeding its absolute expiry.
   * Called by: authentication services during a request.
   */
  async extend(id: string, idleMinutes: number) {
    return this.db.oneOrNone<SessionsRow>(
      `
      UPDATE admin.sessions SET last_seen_at = clock_timestamp(),
        idle_expires_at = LEAST(absolute_expires_at, clock_timestamp() + $2 * interval '1 minute'),
        updated_by = $3
      WHERE id = $1 AND deactivated_at IS NULL
        AND idle_expires_at > clock_timestamp() AND absolute_expires_at > clock_timestamp()
      RETURNING *`,
      [id, idleMinutes, this._resolveAuditActor()]
    );
  }
  /**
   * Does: Revokes an identity's sessions except the optional current session.
   * Called by: authentication services during a request.
   */
  async revokeOthers(actorId: string, keepId?: string) {
    await this.db.none(
      `UPDATE admin.sessions SET deactivated_at = transaction_timestamp(), updated_by = $3
      WHERE portal_user_id = $1 AND deactivated_at IS NULL AND ($2::uuid IS NULL OR id <> $2)`,
      [actorId, keepId ?? null, this._resolveAuditActor()]
    );
  }
}
