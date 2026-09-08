/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Does: Creates admin.portal_user_tenants from its frozen table definition.
 * Called by: the admin migration runner.
 */
export const migration = defineMigration({
  id: '003-portal_user_tenants',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'portal_user_tenants',
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
          name: 'status',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["status IN ('active', 'locked')"],
        indexes: [
          {
            columns: ['portal_user_id', 'tenant_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
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
    await db.none(`      ALTER TABLE admin.portal_user_tenants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
      CREATE TRIGGER stamp_auth_record BEFORE UPDATE ON admin.portal_user_tenants
        FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`);
  },
});
