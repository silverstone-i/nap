/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { AuditRow } from '../../../db/index.js';

/**
 * No `softDelete`: a session's lifecycle is `revoked_at`, so the row extends
 * `AuditRow` directly. `created_at` is load-bearing — it anchors the absolute
 * session lifetime (ADR-0014).
 */
export interface SessionRow extends AuditRow {
  id: string;
  portal_user_id: string;
  token_hash: string;
  idle_expires_at: Date;
  revoked_at: Date | null;
}

/**
 * One row per live session (ADR-0014, PRD 0004): the hash of the current
 * refresh-token verifier, the sliding idle expiry, and the revocation mark.
 * `token_hash` rotates on every accepted refresh; uniqueness guards against
 * verifier collisions rather than serving lookup, which goes by `id` (the
 * refresh token embeds it — RULES/auth-module.md).
 */
export const sessionsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'sessions',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: false,
  columns: [
    // No gen_random_uuid() default: the refresh token embeds the id, so
    // createSession generates it app-side — and pg-schemata drops a
    // defaulted uuid primary key from the ColumnSet, which would discard
    // the supplied value and break the token's row reference.
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'portal_user_id', type: 'uuid', notNull: true },
    { name: 'token_hash', type: 'text', notNull: true },
    { name: 'idle_expires_at', type: 'timestamptz', notNull: true },
    { name: 'revoked_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['token_hash']],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [{ columns: ['portal_user_id'] }],
  },
};

export class Sessions extends TableModel<SessionRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, sessionsSchema, logger);
  }
}
