/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TenantRow extends EntityRow {
  tenant_code: string;
  company: string;
  schema_name: string;
  status: string;
  tier: string | null;
  region: string | null;
  allowed_modules: unknown;
  max_users: number | null;
  notes: string | null;
}

/** Tenant registry (`admin.tenants`). */
export const tenantsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'tenants',
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
    { name: 'tenant_code', type: 'varchar(6)', notNull: true },
    { name: 'company', type: 'varchar(128)', notNull: true },
    { name: 'schema_name', type: 'varchar(63)', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'pending' },
    { name: 'tier', type: 'varchar(20)' },
    { name: 'region', type: 'varchar(64)' },
    // No ':json' mod: pg-schemata's absent-column DEFAULT sentinel is not
    // mod-safe (the mod stringifies it into an identifier). Writers pass the
    // value pre-serialized (JSON.stringify) instead.
    {
      name: 'allowed_modules',
      type: 'jsonb',
      notNull: true,
      default: "'[]'::jsonb",
    },
    { name: 'max_users', type: 'integer' },
    { name: 'notes', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_code'], ['schema_name']],
  },
};

export class Tenants extends TableModel<TenantRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, tenantsSchema, logger);
  }
}
