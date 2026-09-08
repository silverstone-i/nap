/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Does: Creates admin.login_throttles from its frozen table definition.
 * Called by: the admin migration runner.
 */
export const migration = defineMigration({
  id: '005-login_throttles',
  up: async ({ db, pgp }) => {
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
    await db.none(`      ALTER TABLE admin.login_throttles ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
      CREATE TRIGGER stamp_auth_record BEFORE UPDATE ON admin.login_throttles
        FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`);
  },
});
