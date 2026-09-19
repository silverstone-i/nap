/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const tenantsSchema = {
  dbSchema: 'admin',
  table: 'tenants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'tenant_code',
      type: 'varchar(32)',
      notNull: true,
      immutable: true,
    },
    { name: 'name', type: 'varchar(160)', notNull: true },
    { name: 'tier', type: 'text', notNull: true, default: 'starter' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    {
      name: 'is_napsoft',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
    { name: 'cell_id', type: 'uuid' },
    { name: 'provisioned', type: 'boolean', notNull: true, default: false },
    { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "tier IN ('starter', 'growth', 'enterprise')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['cell_id'],
        references: { schema: 'admin', table: 'cells', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'tenants_active_code',
        columns: [{ expression: 'lower(tenant_code)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_napsoft'], unique: true, where: 'is_napsoft = true' },
      { columns: ['cell_id'] },
    ],
  },
};

export class Tenants extends TableModel {
  static schema = tenantsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, tenantsSchema, logger);
  }
}
