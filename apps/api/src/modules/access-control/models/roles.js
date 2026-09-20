/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const rolesSchema = {
  dbSchema: 'app',
  table: 'roles',
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
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'text', notNull: true, immutable: true },
    { name: 'name', type: 'text', notNull: true },
    { name: 'system_role', type: 'text', immutable: true },
    {
      name: 'capabilities',
      type: 'jsonb',
      notNull: true,
      default: "'[]'::jsonb",
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id']],
    checks: [
      "code ~ '^[a-z][a-z0-9_]*$'",
      "system_role IS NULL OR (system_role IN ('platform_admin','support','tenant_admin') AND code=system_role)",
      "system_role IS NOT NULL OR code NOT IN ('platform_admin','support','tenant_admin')",
      "jsonb_typeof(capabilities)='array'",
    ],
    indexes: [
      {
        columns: ['tenant_id', 'code'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['tenant_id', 'system_role'],
        unique: true,
        where: 'system_role IS NOT NULL AND deactivated_at IS NULL',
      },
    ],
  },
};

export class Roles extends TableModel {
  static schema = rolesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, rolesSchema, logger);
  }
}
