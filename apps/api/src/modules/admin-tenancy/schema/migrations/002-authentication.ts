/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates the frozen 002-authentication baseline. Called by: the admin migration runner. */
export const migration = defineMigration({
  id: '002-authentication',
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
        { name: 'access_mode', type: 'text' },
        { name: 'effective_user_id', type: 'uuid' },
        { name: 'access_reason', type: 'text' },
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
          { columns: ['effective_user_id'] },
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
            columns: ['effective_user_id'],
            references: {
              schema: 'admin',
              table: 'portal_users',
              columns: ['id'],
            },
            onDelete: 'RESTRICT',
          },
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
    await db.none(
      `ALTER TABLE admin.sessions ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.sessions FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'login_throttles',
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
          name: 'key_hash',
          type: 'text',
          notNull: true,
        },
        {
          name: 'failures',
          type: 'integer',
          notNull: true,
        },
        {
          name: 'window_started_at',
          type: 'timestamptz',
          notNull: true,
        },
        {
          name: 'locked_until',
          type: 'timestamptz',
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['key_hash']],
        checks: ['failures >= 0'],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.login_throttles ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.login_throttles FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
  },
});
