/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const portalUsersSchema = {
  dbSchema: 'admin',
  table: 'portal_users',
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
    { name: 'email', type: 'varchar(254)', notNull: true },
    { name: 'password_hash', type: 'text', notNull: true },
    {
      name: 'must_change_password',
      type: 'boolean',
      notNull: true,
      default: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'active' },
    {
      name: 'is_root',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('active', 'locked', 'disabled')"],
    indexes: [
      {
        name: 'portal_users_active_email',
        columns: [{ expression: 'lower(email)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_root'], unique: true, where: 'is_root = true' },
    ],
  },
};

export class PortalUsers extends TableModel {
  static schema = portalUsersSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, portalUsersSchema, logger);
  }
}
