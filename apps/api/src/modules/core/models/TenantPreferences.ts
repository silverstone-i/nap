/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TenantPreferenceRow extends EntityRow {
  tenant_id: string | null;
  default_page_size: number;
}

/** One row per tenant: user-interface (UI) and behavior preferences. */
export const tenantPreferencesSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'tenant_preferences',
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
    {
      name: 'default_page_size',
      type: 'integer',
      notNull: true,
      default: 25,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id']],
  },
};

export class TenantPreferences extends TableModel<TenantPreferenceRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, tenantPreferencesSchema, logger);
  }
}
