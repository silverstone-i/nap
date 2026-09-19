/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const platformRolesSchema = {
  dbSchema: 'admin',
  table: 'platform_roles',
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
    { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
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
        references: {
          schema: 'admin',
          table: 'tenants',
          columns: ['id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['portal_user_id', 'tenant_id', 'role_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
    ],
  },
};

export class PlatformRoles extends TableModel {
  static schema = platformRolesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, platformRolesSchema, logger);
  }
}
