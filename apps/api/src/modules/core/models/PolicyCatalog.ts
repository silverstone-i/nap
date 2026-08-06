/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import { z } from 'zod';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';

export interface PolicyCatalogRow {
  id: string;
  module: string;
  router: string;
  action: string;
  label: string | null;
  description: string | null;
  sort_order: number;
  valid_statuses: string[];
  available_fields: string[];
  policy_required: boolean;
}

/**
 * Read-only registry of valid `(module, router, action)` triples for role
 * configuration. Seed data: keeps the uuid `id` but carries no audit columns
 * and no soft delete.
 */
export const policyCatalogSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'policy_catalog',
  hasAuditFields: false,
  softDelete: false,
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
    { name: 'action', type: 'varchar(32)', notNull: true },
    { name: 'label', type: 'varchar(128)' },
    { name: 'description', type: 'varchar(512)' },
    { name: 'sort_order', type: 'integer', notNull: true, default: 0 },
    {
      name: 'valid_statuses',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    {
      name: 'available_fields',
      type: 'text[]',
      notNull: true,
      default: "'{}'::text[]",
      colProps: { validator: z.array(z.string()) },
    },
    { name: 'policy_required', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['module', 'router', 'action']],
  },
};

export class PolicyCatalog extends TableModel<PolicyCatalogRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, policyCatalogSchema, logger);
  }
}
