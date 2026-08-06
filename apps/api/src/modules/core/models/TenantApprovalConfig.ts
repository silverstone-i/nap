/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface TenantApprovalConfigRow extends EntityRow {
  workflow_type: string;
  require_approval: boolean;
}

/** Per-workflow approval requirement setting; one row per workflow type. */
export const tenantApprovalConfigSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'tenant_approval_config',
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
    { name: 'workflow_type', type: 'varchar(32)', notNull: true },
    { name: 'require_approval', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['workflow_type']],
  },
};

export class TenantApprovalConfig extends TableModel<TenantApprovalConfigRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, tenantApprovalConfigSchema, logger);
  }
}
