/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface RoleRow extends EntityRow {
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  is_immutable: boolean;
  scope: string;
  tenant_code: string | null;
}

/** Role definitions; `scope` drives RBAC layer 2. */
export const rolesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'roles',
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
    { name: 'code', type: 'varchar(32)', notNull: true },
    { name: 'name', type: 'varchar(64)', notNull: true },
    { name: 'description', type: 'text' },
    { name: 'is_system', type: 'boolean', notNull: true, default: false },
    { name: 'is_immutable', type: 'boolean', notNull: true, default: false },
    { name: 'scope', type: 'varchar(32)', notNull: true },
    { name: 'tenant_code', type: 'varchar(6)' },
  ],
  constraints: {
    primaryKey: ['id'],
    indexes: [
      { columns: ['code'], unique: true, where: 'deactivated_at IS NULL' },
    ],
  },
};

export class Roles extends TableModel<RoleRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, rolesSchema, logger);
  }
}
