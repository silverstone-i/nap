/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.support_grants`: a support operator's request to act as a tenant member, and that member's or a `tenant_admin`'s decision.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const supportGrantsSchema = {
  dbSchema: 'admin',
  table: 'support_grants',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'operator_id', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'effective_user_id',
      type: 'uuid',
      notNull: true,
      immutable: true,
    },
    { name: 'reason', type: 'varchar(512)', notNull: true, immutable: true },
    {
      name: 'expires_at',
      type: 'timestamptz',
      notNull: true,
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'decided_by', type: 'uuid' },
    { name: 'decided_at', type: 'timestamptz' },
    { name: 'session_id', type: 'uuid' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "status IN ('pending', 'approved', 'denied', 'expired', 'used', 'cancelled')",
      'operator_id <> effective_user_id',
      "(status = 'pending' AND decided_by IS NULL AND decided_at IS NULL AND session_id IS NULL) OR (status IN ('approved', 'denied') AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND session_id IS NULL) OR (status = 'used' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND session_id IS NOT NULL) OR (status IN ('expired', 'cancelled') AND session_id IS NULL)",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['operator_id'],
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
        columns: ['decided_by'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['session_id'],
        references: { schema: 'admin', table: 'sessions', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'support_grants_open_request',
        columns: ['operator_id', 'tenant_id', 'effective_user_id'],
        unique: true,
        where: "status IN ('pending', 'approved')",
      },
      { columns: ['effective_user_id', 'status'] },
      { columns: ['tenant_id', 'status'] },
      { columns: ['expires_at'] },
    ],
  },
};

/** Model for `admin.support_grants`. Inherits the standard table operations only. */
export class SupportGrants extends TableModel {
  static schema = supportGrantsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, supportGrantsSchema, logger);
  }
}
