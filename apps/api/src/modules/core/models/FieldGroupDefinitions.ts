/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface FieldGroupDefinitionRow extends EntityRow {
  module: string;
  router: string;
  group_name: string;
  columns: string[];
  is_default: boolean;
}

/**
 * Named column sets (RBAC layer 4). `is_default` groups are granted to every
 * role automatically.
 */
export const fieldGroupDefinitionsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'field_group_definitions',
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
    { name: 'module', type: 'varchar(32)', notNull: true },
    { name: 'router', type: 'varchar(64)', notNull: true },
    { name: 'group_name', type: 'varchar(64)', notNull: true },
    {
      name: 'columns',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    { name: 'is_default', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

export class FieldGroupDefinitions extends TableModel<FieldGroupDefinitionRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, fieldGroupDefinitionsSchema, logger);
  }
}
