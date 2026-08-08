/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface PolicyRow extends EntityRow {
  role_id: string;
  module: string;
  router: string;
  action: string;
  level: string;
  tenant_code: string | null;
}

/** Per-role grants (RBAC layer 1). Empty string means wildcard. */
export const policiesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'policies',
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
    { name: 'module', type: 'varchar(32)', notNull: true, default: "''" },
    { name: 'router', type: 'varchar(64)', notNull: true, default: "''" },
    { name: 'action', type: 'varchar(32)', notNull: true, default: "''" },
    { name: 'level', type: 'varchar(8)', notNull: true },
    { name: 'tenant_code', type: 'varchar(6)' },
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

export class Policies extends TableModel<PolicyRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, policiesSchema, logger);
  }
}
