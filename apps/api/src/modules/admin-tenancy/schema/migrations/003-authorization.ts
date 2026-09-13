/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates the frozen 003-authorization baseline. Called by: the admin migration runner. */
export const migration = defineMigration({
  id: '003-authorization',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'platform_grants',
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
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'role',
          type: 'text',
          notNull: true,
        },
        {
          name: 'permission',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["role IN ('package_admin','support')"],
        indexes: [
          {
            columns: ['portal_user_id', 'permission'],
            unique: true,
            where: 'deactivated_at IS NULL',
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
        ],
        unique: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.platform_grants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.platform_grants FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'platform_roles',
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
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'role',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['portal_user_id', 'role']],
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
        ],
        checks: ["role IN ('platform_admin','support')"],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.platform_roles ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE FUNCTION admin.platform_roles_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.platform_roles FOR EACH ROW EXECUTE FUNCTION admin.platform_roles_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'support_policy',
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
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'code',
          type: 'text',
          notNull: true,
        },
        {
          name: 'permissions',
          type: 'jsonb',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['code']],
        foreignKeys: [],
        checks: [],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.support_policy ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE FUNCTION admin.support_policy_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.support_policy FOR EACH ROW EXECUTE FUNCTION admin.support_policy_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'module_entitlements',
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
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'tenant_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        {
          name: 'module',
          type: 'text',
          notNull: true,
        },
        {
          name: 'enabled',
          type: 'boolean',
          notNull: true,
          default: false,
        },
        {
          name: 'revision',
          type: 'integer',
          notNull: true,
          default: 1,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'module']],
        foreignKeys: [
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
        checks: ["module = 'projects'", 'revision > 0'],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.module_entitlements ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE FUNCTION admin.module_entitlements_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.module_entitlements FOR EACH ROW EXECUTE FUNCTION admin.module_entitlements_stamp();`
    );
  },
});
