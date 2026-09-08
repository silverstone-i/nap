/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Does: Creates admin.portal_users from its frozen table definition.
 * Called by: the admin migration runner.
 */
export const migration = defineMigration({
  id: '002-portal_users',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'portal_users',
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
          name: 'email',
          type: 'varchar(128)',
          notNull: true,
        },
        {
          name: 'password_hash',
          type: 'text',
          notNull: true,
        },
        {
          name: 'status',
          type: 'text',
          notNull: true,
        },
        {
          name: 'is_root',
          type: 'boolean',
          notNull: true,
          default: false,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["status IN ('active', 'locked')"],
        indexes: [
          {
            name: 'portal_users_active_email',
            columns: [{ expression: 'lower(email)' }],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          {
            columns: ['is_root'],
            unique: true,
            where: 'is_root = true',
          },
        ],
      },
    }).createTable();
    await db.none(`
      CREATE FUNCTION admin.guard_root_identity() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.is_root AND (TG_OP = 'DELETE') THEN
          RAISE EXCEPTION 'Root identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF OLD.is_root AND (NEW.email IS DISTINCT FROM OLD.email OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW.is_root IS DISTINCT FROM OLD.is_root OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at) THEN
          RAISE EXCEPTION 'Root identity is immutable' USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER guard_root_identity BEFORE UPDATE OR DELETE ON admin.portal_users
        FOR EACH ROW EXECUTE FUNCTION admin.guard_root_identity();
      ALTER TABLE admin.portal_users ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
      CREATE TRIGGER stamp_auth_record BEFORE UPDATE ON admin.portal_users
        FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`);
  },
});
