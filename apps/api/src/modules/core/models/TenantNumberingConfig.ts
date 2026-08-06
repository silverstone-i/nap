/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TenantNumberingConfigRow extends EntityRow {
  tenant_id: string | null;
  id_type: string;
  prefix: string | null;
  suffix: string | null;
  date_mode: string;
  reset_mode: string;
  padding: number;
  separator: string;
  uppercase: boolean;
  scope_type: string;
  is_enabled: boolean;
}

/** Display-id format per id type (employee, vendor, ap_invoice, …). */
export const tenantNumberingConfigSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'tenant_numbering_config',
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
    { name: 'tenant_id', type: 'uuid' },
    { name: 'id_type', type: 'varchar(32)', notNull: true },
    { name: 'prefix', type: 'varchar(16)' },
    { name: 'suffix', type: 'varchar(16)' },
    { name: 'date_mode', type: 'varchar(16)', notNull: true, default: 'none' },
    {
      name: 'reset_mode',
      type: 'varchar(16)',
      notNull: true,
      default: 'never',
    },
    { name: 'padding', type: 'integer', notNull: true, default: 4 },
    { name: 'separator', type: 'varchar(4)', notNull: true, default: '-' },
    { name: 'uppercase', type: 'boolean', notNull: true, default: true },
    { name: 'scope_type', type: 'varchar(32)', notNull: true, default: 'none' },
    { name: 'is_enabled', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

export class TenantNumberingConfig extends TableModel<TenantNumberingConfigRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, tenantNumberingConfigSchema, logger);
  }
}
