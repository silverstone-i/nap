/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const sessionsSchema = {
  dbSchema: 'admin',
  table: 'sessions',
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
    { name: 'token_hash', type: 'text', notNull: true },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'access_mode', type: 'text', notNull: true, default: 'normal' },
    { name: 'effective_user_id', type: 'uuid' },
    { name: 'access_reason', type: 'varchar(512)' },
    { name: 'access_expires_at', type: 'timestamptz' },
    {
      name: 'last_seen_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'idle_expires_at', type: 'timestamptz', notNull: true },
    { name: 'absolute_expires_at', type: 'timestamptz', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['token_hash']],
    checks: [
      "access_mode IN ('normal', 'support')",
      "(access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL)",
      'idle_expires_at <= absolute_expires_at',
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
        columns: ['effective_user_id'],
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
      { columns: ['portal_user_id'] },
      { columns: ['tenant_id'] },
      { columns: ['absolute_expires_at'] },
    ],
  },
};

export class Sessions extends TableModel {
  static schema = sessionsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, sessionsSchema, logger);
  }
}
