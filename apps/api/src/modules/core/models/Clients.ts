/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface ClientRow extends EntityRow {
  source_id: string;
  name: string;
  code: string;
  roles: string[];
  is_app_user: boolean;
  is_active: boolean;
}

/** Customer master; email lives in `emails`. */
export const clientsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'clients',
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
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'code', type: 'varchar(16)', notNull: true },
    {
      name: 'roles',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    { name: 'is_app_user', type: 'boolean', notNull: true, default: false },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
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

export class Clients extends TableModel<ClientRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, clientsSchema, logger);
  }
}
