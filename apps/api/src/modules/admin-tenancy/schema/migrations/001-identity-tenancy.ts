/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates the frozen 001-identity-tenancy baseline. Called by: the admin migration runner. */
export const migration = defineMigration({
  id: '001-identity-tenancy',
  up: async ({ db, pgp }) => {
    await db.none(`CREATE FUNCTION admin.stamp_auth_record() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        NEW.updated_at = transaction_timestamp();
        IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at AND NEW.deactivated_at IS NOT NULL THEN
          NEW.deactivated_at = transaction_timestamp();
        END IF;
        IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable identifier' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END $$;`);
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'cells',
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
          name: 'name',
          type: 'text',
          notNull: true,
        },
        {
          name: 'enabled',
          type: 'boolean',
          notNull: true,
          default: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [
          {
            columns: ['code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [],
        unique: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.cells ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.cells FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
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
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
        { name: 'tier', type: 'text', notNull: true, default: 'starter' },
        { name: 'cell_id', type: 'uuid' },
        { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
        { name: 'provisioned', type: 'boolean', notNull: true, default: false },
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
        checks: [
          "status IN ('pending', 'active', 'suspended')",
          "tier IN ('starter','growth','enterprise')",
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['cell_id'],
            references: { schema: 'admin', table: 'cells', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          { columns: ['cell_id'] },
          {
            columns: ['tenant_code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE admin.tenants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.tenants FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
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
          name: 'must_change_password',
          type: 'boolean',
          notNull: true,
          default: false,
        },
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
    await db.none(
      `ALTER TABLE admin.portal_users ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.portal_users FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
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
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
        { name: 'user_type', type: 'text' },
        { name: 'entity_id', type: 'uuid' },
        { name: 'ready', type: 'boolean', notNull: true, default: false },
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
    await db.none(
      `ALTER TABLE admin.portal_user_tenants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.portal_user_tenants FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
    await db.none(`CREATE FUNCTION admin.guard_root_identity() RETURNS trigger LANGUAGE plpgsql AS $$
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
      END $$;CREATE FUNCTION admin.guard_root_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM admin.portal_users WHERE (id=NEW.portal_user_id OR id=OLD.portal_user_id) AND is_root) THEN
  IF TG_OP='DELETE' OR NEW.status <> 'active' OR NEW.deactivated_at IS NOT NULL OR NOT NEW.ready OR (TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.portal_user_id IS DISTINCT FROM OLD.portal_user_id OR NEW.status <> 'active' OR NEW.deactivated_at IS NOT NULL OR NEW.user_type IS NOT NULL OR NEW.entity_id IS NOT NULL)) OR
  (TG_OP='INSERT' AND (NEW.user_type IS NOT NULL OR NEW.entity_id IS NOT NULL OR EXISTS(SELECT 1 FROM admin.portal_user_tenants WHERE portal_user_id=NEW.portal_user_id))) THEN
   RAISE EXCEPTION 'Root membership is immutable' USING ERRCODE='23514'; END IF;
 END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;CREATE TRIGGER guard_root_identity BEFORE UPDATE OR DELETE ON admin.portal_users FOR EACH ROW EXECUTE FUNCTION admin.guard_root_identity();
CREATE TRIGGER root_membership BEFORE INSERT OR UPDATE OR DELETE ON admin.portal_user_tenants FOR EACH ROW EXECUTE FUNCTION admin.guard_root_membership();
CREATE TABLE admin.cell_provisioning (
 cell_id uuid PRIMARY KEY REFERENCES admin.cells(id) ON DELETE RESTRICT,
 environment text NOT NULL CHECK(environment IN ('dev','test','prod')),
 name text NOT NULL, database_name text NOT NULL, operation_id uuid NOT NULL UNIQUE,
 resource_id text, stage text NOT NULL DEFAULT 'registered', failure_code text,
 UNIQUE(environment,name), UNIQUE(environment,database_name)
);
`);
  },
});
