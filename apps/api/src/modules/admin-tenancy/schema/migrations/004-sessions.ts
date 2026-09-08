/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Does: Creates admin.sessions from its frozen table definition.
 * Called by: the admin migration runner.
 */
export const migration = defineMigration({
  id: '004-sessions',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'sessions',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'tenant_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'token_hash',
          type: 'text',
          notNull: true,
        },
        {
          name: 'idle_expires_at',
          type: 'timestamptz',
          notNull: true,
        },
        {
          name: 'absolute_expires_at',
          type: 'timestamptz',
          notNull: true,
        },
        {
          name: 'last_seen_at',
          type: 'timestamptz',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['token_hash']],
        indexes: [
          {
            columns: ['portal_user_id'],
          },
          {
            columns: ['tenant_id'],
          },
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['portal_user_id'],
            references: {
              schema: 'admin',
              table: 'portal_users',
              columns: ['id'],
            },
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
      },
    }).createTable();
    await db.none(`      ALTER TABLE admin.sessions ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
      CREATE TRIGGER stamp_auth_record BEFORE UPDATE ON admin.sessions
        FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`);
  },
});
