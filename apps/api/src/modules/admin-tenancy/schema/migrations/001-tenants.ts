/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Does: Creates admin.tenants from its frozen table definition.
 * Called by: the admin migration runner.
 */
export const migration = defineMigration({
  id: '001-tenants',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'tenants',
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
          name: 'tenant_code',
          type: 'varchar(16)',
          notNull: true,
        },
        {
          name: 'company',
          type: 'varchar(128)',
          notNull: true,
        },
        {
          name: 'status',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["status IN ('pending', 'active', 'suspended')"],
        indexes: [
          {
            columns: ['tenant_code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
      },
    }).createTable();
    await db.none(`
      CREATE FUNCTION admin.stamp_auth_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = transaction_timestamp();
        IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at AND NEW.deactivated_at IS NOT NULL THEN
          NEW.deactivated_at = transaction_timestamp();
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable identifier' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$;
      ALTER TABLE admin.tenants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
      CREATE TRIGGER stamp_auth_record BEFORE UPDATE ON admin.tenants
        FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`);
  },
});
