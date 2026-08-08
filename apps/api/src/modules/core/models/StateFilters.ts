/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface StateFilterRow extends EntityRow {
  role_id: string;
  module: string;
  router: string;
  visible_statuses: string[];
}

/** Per-role visible statuses (RBAC layer 3). Empty array = no filtering. */
export const stateFiltersSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'state_filters',
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
    { name: 'role_id', type: 'uuid', notNull: true },
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', notNull: true },
    {
      name: 'visible_statuses',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['role_id'],
        references: { table: 'roles', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [{ columns: ['role_id'] }],
  },
};

export class StateFilters extends TableModel<StateFilterRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, stateFiltersSchema, logger);
  }
}
