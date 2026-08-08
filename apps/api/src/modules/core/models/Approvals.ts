/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface ApprovalRow extends EntityRow {
  entity_type: string;
  entity_id: string;
  action: string;
  prior_status: string | null;
  new_status: string;
  reason: string | null;
}

/**
 * Append-only log of workflow state transitions, polymorphic across modules.
 * `entity_id` carries no FK by design.
 */
export const approvalsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'approvals',
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
    { name: 'entity_type', type: 'varchar(32)', notNull: true },
    { name: 'entity_id', type: 'uuid', notNull: true },
    { name: 'action', type: 'varchar(32)', notNull: true },
    { name: 'prior_status', type: 'varchar(20)' },
    { name: 'new_status', type: 'varchar(20)', notNull: true },
    { name: 'reason', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [{ columns: ['entity_type', 'entity_id'] }],
  },
};

export class Approvals extends TableModel<ApprovalRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, approvalsSchema, logger);
  }
}
