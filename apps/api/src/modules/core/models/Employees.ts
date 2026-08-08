/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface EmployeeRow extends EntityRow {
  source_id: string;
  first_name: string;
  last_name: string;
  code: string;
  position: string | null;
  department: string | null;
  roles: string[];
  is_app_user: boolean;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

/** Internal staff. Role membership lives on the row (`roles text[]`). */
export const employeesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'employees',
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
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'first_name', type: 'varchar(64)', notNull: true },
    { name: 'last_name', type: 'varchar(64)', notNull: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    { name: 'position', type: 'varchar(64)' },
    { name: 'department', type: 'varchar(64)' },
    {
      name: 'roles',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    { name: 'is_app_user', type: 'boolean', notNull: true, default: false },
    {
      name: 'is_primary_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'is_billing_contact',
      type: 'boolean',
      notNull: true,
      default: false,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { columns: ['code'], unique: true, where: 'deactivated_at IS NULL' },
      { columns: ['source_id'] },
    ],
  },
};

export class Employees extends TableModel<EmployeeRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, employeesSchema, logger);
  }
}
