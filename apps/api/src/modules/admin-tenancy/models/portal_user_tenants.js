/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.portal_user_tenants`: portal-user to tenant memberships. `member_id` holds the member's UUID in the tenant's cell and is not a foreign key.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const portalUserTenantsSchema = {
  dbSchema: 'admin',
  table: 'portal_user_tenants',
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
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'member_type', type: 'text' },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'member_id', type: 'uuid' },
    { name: 'ready', type: 'boolean', notNull: true, default: false },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor', 'contact')",
      "status IN ('pending', 'active', 'suspended')",
      'revision > 0',
      "(member_type IS NULL AND status = 'active' AND ready = true AND member_id IS NULL) OR (member_type IS NOT NULL AND (ready = false OR (status = 'active' AND member_id IS NOT NULL)))",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['tenant_id', 'status'] },
    ],
  },
};

/** Model for `admin.portal_user_tenants`. Inherits the standard table operations only. */
export class PortalUserTenants extends TableModel {
  static schema = portalUserTenantsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, portalUserTenantsSchema, logger);
  }
}
