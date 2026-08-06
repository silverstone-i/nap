/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface SourceRow extends EntityRow {
  table_id: string | null;
  source_type: string;
  label: string | null;
}

/**
 * Discriminated-union parent: one row per entity that owns polymorphic
 * children (addresses, phones, emails, tax ids). `table_id` points at the
 * owning entity row and is filled once that row exists.
 */
export const sourcesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'sources',
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
    { name: 'table_id', type: 'uuid' },
    { name: 'source_type', type: 'varchar(32)', notNull: true },
    { name: 'label', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [{ columns: ['table_id'] }],
  },
};

export class Sources extends TableModel<SourceRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, sourcesSchema, logger);
  }
}
