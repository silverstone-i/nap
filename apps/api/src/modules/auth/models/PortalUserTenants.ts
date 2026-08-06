/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface PortalUserTenantRow extends EntityRow {
  portal_user_id: string;
  tenant_id: string;
  user_type: string;
  entity_id: string;
  status: string;
  last_used_at: Date;
}

/**
 * Authoritative user–tenant binding (`admin.portal_user_tenants`). The
 * composite FK `(portal_user_id, user_type)` keeps the denormalized
 * `user_type` copy consistent with `admin.portal_users`; the three partial
 * unique indexes are ADR-0004's binding rules, expressed as indexes because
 * the `unique` constraint form has no WHERE clause.
 */
export const portalUserTenantsSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'portal_user_tenants',
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
    { name: 'portal_user_id', type: 'uuid', notNull: true },
    { name: 'tenant_id', type: 'uuid', notNull: true },
    { name: 'user_type', type: 'varchar(16)', notNull: true },
    { name: 'entity_id', type: 'uuid', notNull: true },
    { name: 'status', type: 'varchar(20)', notNull: true, default: 'invited' },
    {
      name: 'last_used_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'CASCADE',
      },
      {
        type: 'ForeignKey',
        columns: ['portal_user_id', 'user_type'],
        references: {
          schema: 'admin',
          table: 'portal_users',
          columns: ['id', 'user_type'],
        },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['tenant_id', 'entity_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['portal_user_id'],
        unique: true,
        where: "deactivated_at IS NULL AND user_type IN ('employee', 'client')",
      },
      { columns: ['tenant_id'] },
    ],
  },
};

export class PortalUserTenants extends TableModel<PortalUserTenantRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, portalUserTenantsSchema, logger);
  }
}
