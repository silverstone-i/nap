/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface FieldGroupGrantRow extends EntityRow {
  role_id: string;
  field_group_id: string;
}

/** Role → field-group grants; a role with none sees all columns. */
export const fieldGroupGrantsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'field_group_grants',
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
    { name: 'field_group_id', type: 'uuid', notNull: true },
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
      {
        type: 'ForeignKey',
        columns: ['field_group_id'],
        references: { table: 'field_group_definitions', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [{ columns: ['role_id'] }, { columns: ['field_group_id'] }],
  },
};

export class FieldGroupGrants extends TableModel<FieldGroupGrantRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, fieldGroupGrantsSchema, logger);
  }
}
