/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface PortalUserRow extends EntityRow {
  email: string;
  password_hash: string | null;
  user_type: string;
  status: string;
  session_idle_minutes: number;
}

/**
 * Global login identity (`admin.portal_users`), one row per person. PII lives
 * on the tenant-schema entity referenced by each binding row (ADR-0004). The
 * plain unique on `(id, user_type)` exists as the target of
 * `admin.portal_user_tenants`' composite foreign key.
 */
export const portalUsersSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'portal_users',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'email', type: 'varchar(128)', notNull: true },
    { name: 'password_hash', type: 'text' },
    { name: 'user_type', type: 'varchar(16)', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'invited' },
    // 30 | 60 | 90 | 120, enforced by the idle-window route's request schema
    // (PRD 0004); clamped to the tenant bounds per session (ADR-0014).
    {
      name: 'session_idle_minutes',
      type: 'integer',
      notNull: true,
      default: 30,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['id', 'user_type']],
    indexes: [
      {
        columns: ['email'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};

export class PortalUsers extends TableModel<PortalUserRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, portalUsersSchema, logger);
  }
}
