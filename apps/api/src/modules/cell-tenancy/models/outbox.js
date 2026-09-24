/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `cell.outbox`: cell-to-admin requests waiting for delivery.
 * Kept identical to the copy frozen in migration `001-cell-tenancy`.
 */
export const outboxSchema = {
  dbSchema: 'cell',
  table: 'outbox',
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
    { name: 'topic', type: 'text', notNull: true, immutable: true },
    { name: 'entity_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'revision', type: 'integer', notNull: true, immutable: true },
    {
      name: 'payload',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
      immutable: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'pending' },
    { name: 'attempts', type: 'integer', notNull: true, default: 0 },
    {
      name: 'next_attempt_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'delivered_at', type: 'timestamptz' },
    { name: 'failure_code', type: 'varchar(64)' },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: [
      "topic IN ('portal_access')",
      "status IN ('pending', 'delivered', 'failed')",
      'revision > 0',
      'attempts >= 0',
      "(status = 'delivered' AND delivered_at IS NOT NULL AND failure_code IS NULL) OR (status <> 'delivered' AND delivered_at IS NULL)",
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'cell', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        name: 'outbox_change',
        columns: ['topic', 'entity_id', 'revision'],
        unique: true,
      },
      { columns: ['status', 'next_attempt_at'] },
      { columns: ['tenant_id', 'status'] },
    ],
  },
};

/** Model for `cell.outbox`. Inherits the standard table operations only. */
export class Outbox extends TableModel {
  static schema = outboxSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, outboxSchema, logger);
  }
}
