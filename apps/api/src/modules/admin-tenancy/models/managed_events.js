/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

export const managedEventsSchema = {
  dbSchema: 'admin',
  table: 'managed_events',
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'deduplication_key', type: 'uuid', notNull: true, immutable: true },
    {
      name: 'occurred_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
      immutable: true,
    },
    { name: 'request_id', type: 'uuid', immutable: true },
    { name: 'event_key', type: 'varchar(128)', notNull: true, immutable: true },
    { name: 'outcome', type: 'text', notNull: true, immutable: true },
    { name: 'actor_id', type: 'uuid', immutable: true },
    { name: 'effective_user_id', type: 'uuid', immutable: true },
    { name: 'tenant_id', type: 'uuid', immutable: true },
    { name: 'target_type', type: 'varchar(64)', immutable: true },
    { name: 'target_id', type: 'uuid', immutable: true },
    { name: 'session_id', type: 'uuid', immutable: true },
    { name: 'reason', type: 'varchar(512)', immutable: true },
    {
      name: 'details',
      type: 'jsonb',
      notNull: true,
      default: "'{}'::jsonb",
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['deduplication_key']],
    checks: ["outcome IN ('succeeded', 'failed', 'denied')"],
    indexes: [
      { columns: ['occurred_at'] },
      { columns: ['actor_id', 'occurred_at'] },
      { columns: ['tenant_id', 'occurred_at'] },
      { columns: ['event_key', 'occurred_at'] },
    ],
  },
};

export class ManagedEvents extends TableModel {
  static schema = managedEventsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, managedEventsSchema, logger);
  }
}
