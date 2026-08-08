/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface ImpersonationLogRow extends EntityRow {
  impersonator_id: string;
  target_user_id: string;
  target_tenant_code: string;
  reason: string | null;
  started_at: Date;
  ended_at: Date | null;
}

/** Audit of impersonation sessions (`admin.impersonation_logs`). */
export const impersonationLogsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'impersonation_logs',
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
    { name: 'impersonator_id', type: 'uuid', notNull: true },
    { name: 'target_user_id', type: 'uuid', notNull: true },
    { name: 'target_tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'reason', type: 'text' },
    {
      name: 'started_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'ended_at', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [
      { columns: ['impersonator_id'] },
      { columns: ['target_user_id'] },
    ],
  },
};

export class ImpersonationLogs extends TableModel<ImpersonationLogRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, impersonationLogsSchema, logger);
  }
}
