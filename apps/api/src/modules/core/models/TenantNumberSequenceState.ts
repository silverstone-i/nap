/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TenantNumberSequenceStateRow extends EntityRow {
  tenant_id: string | null;
  id_type: string;
  scope_id: string;
  period_key: string;
  last_serial: string;
}

/**
 * Serial counters, one per `(id_type, scope, period)`. `scope_id` is the nil
 * uuid for global sequences; `period_key` is `'global'`, `YYYY`, `YYYY-MM`,
 * or `YYYY-MM-DD` per the configured reset mode.
 */
export const tenantNumberSequenceStateSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'tenant_number_sequence_state',
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
    { name: 'tenant_id', type: 'uuid' },
    { name: 'id_type', type: 'varchar(32)', notNull: true },
    {
      name: 'scope_id',
      type: 'uuid',
      notNull: true,
      default: "'00000000-0000-0000-0000-000000000000'::uuid",
    },
    {
      name: 'period_key',
      type: 'varchar(16)',
      notNull: true,
      default: 'global',
    },
    { name: 'last_serial', type: 'bigint', notNull: true, default: 0 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['id_type', 'scope_id', 'period_key']],
  },
};

export class TenantNumberSequenceState extends TableModel<TenantNumberSequenceStateRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, tenantNumberSequenceStateSchema, logger);
  }
}
