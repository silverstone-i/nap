/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline admin migration. It creates the twelve admin tables in dependency
 * order, installs the protection trigger functions and triggers, disables
 * row-level security, and applies the `nap-app` grant contract.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-admin-tenancy',
  up: async ({ db, pgp }) => {
    const cellsSchema = {
      dbSchema: 'admin',
      table: 'cells',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'environment', type: 'text', notNull: true, immutable: true },
        {
          name: 'database_name',
          type: 'varchar(63)',
          notNull: true,
          immutable: true,
        },
        { name: 'enabled', type: 'boolean', notNull: true, default: false },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["environment IN ('dev', 'test', 'prod')"],
        indexes: [
          {
            columns: ['environment', 'database_name'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
      },
    };
    const portalUsersSchema = {
      dbSchema: 'admin',
      table: 'portal_users',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'email', type: 'varchar(254)', notNull: true },
        { name: 'password_hash', type: 'text', notNull: true },
        {
          name: 'must_change_password',
          type: 'boolean',
          notNull: true,
          default: true,
        },
        { name: 'status', type: 'text', notNull: true, default: 'active' },
        {
          name: 'is_root',
          type: 'boolean',
          notNull: true,
          default: false,
          immutable: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["status IN ('active', 'locked', 'disabled')"],
        indexes: [
          {
            name: 'portal_users_active_email',
            columns: [{ expression: 'lower(email)' }],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['is_root'], unique: true, where: 'is_root = true' },
        ],
      },
    };
    const tenantsSchema = {
      dbSchema: 'admin',
      table: 'tenants',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
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
          name: 'tenant_code',
          type: 'varchar(32)',
          notNull: true,
          immutable: true,
        },
        { name: 'name', type: 'varchar(160)', notNull: true },
        { name: 'tier', type: 'text', notNull: true, default: 'starter' },
        { name: 'status', type: 'text', notNull: true, default: 'pending' },
        {
          name: 'is_napsoft',
          type: 'boolean',
          notNull: true,
          default: false,
          immutable: true,
        },
        { name: 'cell_id', type: 'uuid' },
        { name: 'provisioned', type: 'boolean', notNull: true, default: false },
        { name: 'rbac_ready', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "tier IN ('starter', 'growth', 'enterprise')",
          "status IN ('pending', 'active', 'suspended')",
          'revision > 0',
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
          {
            name: 'tenants_active_code',
            columns: [{ expression: 'lower(tenant_code)' }],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['is_napsoft'], unique: true, where: 'is_napsoft = true' },
          { columns: ['cell_id'] },
        ],
      },
    };
    const portalUserTenantsSchema = {
      dbSchema: 'admin',
      table: 'portal_user_tenants',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
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
          immutable: true,
        },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'member_type', type: 'text' },
        { name: 'status', type: 'text', notNull: true, default: 'pending' },
        { name: 'member_id', type: 'uuid' },
        { name: 'ready', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor', 'contact')",
          "status IN ('pending', 'active', 'suspended')",
          'revision > 0',
          "(member_type IS NULL AND status = 'active' AND ready = true AND member_id IS NULL) OR (member_type IS NOT NULL AND (ready = false OR (status = 'active' AND member_id IS NOT NULL)))",
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
            references: { schema: 'admin', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['portal_user_id', 'tenant_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['tenant_id', 'status'] },
        ],
      },
    };
    const sessionsSchema = {
      dbSchema: 'admin',
      table: 'sessions',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
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
          immutable: true,
        },
        { name: 'token_hash', type: 'text', notNull: true },
        { name: 'tenant_id', type: 'uuid' },
        { name: 'access_mode', type: 'text', notNull: true, default: 'normal' },
        { name: 'effective_user_id', type: 'uuid' },
        { name: 'access_reason', type: 'varchar(512)' },
        { name: 'access_expires_at', type: 'timestamptz' },
        {
          name: 'last_seen_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
        },
        { name: 'idle_expires_at', type: 'timestamptz', notNull: true },
        { name: 'absolute_expires_at', type: 'timestamptz', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['token_hash']],
        checks: [
          "access_mode IN ('normal', 'support')",
          "(access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL)",
          'idle_expires_at <= absolute_expires_at',
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
            columns: ['tenant_id'],
            references: { schema: 'admin', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          { columns: ['portal_user_id'] },
          { columns: ['tenant_id'] },
          { columns: ['absolute_expires_at'] },
        ],
      },
    };
    const loginThrottlesSchema = {
      dbSchema: 'admin',
      table: 'login_throttles',
      columns: [
        { name: 'key_hash', type: 'text', notNull: true, immutable: true },
        { name: 'failures', type: 'integer', notNull: true, default: 0 },
        { name: 'window_started_at', type: 'timestamptz', notNull: true },
        { name: 'last_failed_at', type: 'timestamptz', notNull: true },
        { name: 'locked_until', type: 'timestamptz' },
      ],
      constraints: {
        primaryKey: ['key_hash'],
        checks: ['failures >= 0'],
        indexes: [
          { columns: ['locked_until'] },
          { columns: ['last_failed_at'] },
        ],
      },
    };
    const platformRolesSchema = {
      dbSchema: 'admin',
      table: 'platform_roles',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
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
          immutable: true,
        },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
      ],
      constraints: {
        primaryKey: ['id'],
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
        indexes: [
          {
            columns: ['portal_user_id', 'tenant_id', 'role_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
      },
    };
    const cellProvisioningSchema = {
      dbSchema: 'admin',
      table: 'cell_provisioning',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'operation_id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'requested_action',
          type: 'text',
          notNull: true,
          default: 'provision',
        },
        { name: 'stage', type: 'text', notNull: true, default: 'registered' },
        { name: 'status', type: 'text', notNull: true, default: 'queued' },
        { name: 'attempts', type: 'integer', notNull: true, default: 0 },
        { name: 'failure_code', type: 'varchar(64)' },
        { name: 'started_at', type: 'timestamptz' },
        { name: 'completed_at', type: 'timestamptz' },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['cell_id'], ['operation_id']],
        checks: [
          "requested_action IN ('provision', 'activate')",
          "stage IN ('registered', 'setup', 'migration', 'seed', 'activation', 'complete')",
          "status IN ('queued', 'running', 'failed', 'completed')",
          'attempts >= 0',
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['cell_id'],
            references: { schema: 'admin', table: 'cells', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [{ columns: ['status', 'stage'] }],
      },
    };
    const provisioningJobsSchema = {
      dbSchema: 'admin',
      table: 'provisioning_jobs',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'membership_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'kind', type: 'text', notNull: true, immutable: true },
        { name: 'status', type: 'text', notNull: true, default: 'queued' },
        { name: 'attempts', type: 'integer', notNull: true, default: 0 },
        { name: 'result_member_id', type: 'uuid' },
        { name: 'failure_code', type: 'varchar(64)' },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "kind IN ('employee', 'client', 'vendor', 'contact')",
          "status IN ('queued', 'running', 'failed', 'completed')",
          'attempts >= 0',
          "(status = 'completed' AND result_member_id IS NOT NULL AND failure_code IS NULL) OR status <> 'completed'",
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: { schema: 'admin', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['membership_id'],
            references: {
              schema: 'admin',
              table: 'portal_user_tenants',
              columns: ['id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['membership_id'],
            unique: true,
            where: "deactivated_at IS NULL AND status IN ('queued', 'running')",
          },
          { columns: ['status'] },
        ],
      },
    };
    const moduleEntitlementsSchema = {
      dbSchema: 'admin',
      table: 'module_entitlements',
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
        { name: 'module', type: 'text', notNull: true, immutable: true },
        { name: 'enabled', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'module']],
        checks: ['revision > 0'],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: { schema: 'admin', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [{ columns: ['tenant_id', 'enabled'] }],
      },
    };
    const cacheRevisionsSchema = {
      dbSchema: 'admin',
      table: 'cache_revisions',
      columns: [
        { name: 'domain', type: 'text', notNull: true, immutable: true },
        { name: 'entity', type: 'text', notNull: true, immutable: true },
        { name: 'revision', type: 'bigint', notNull: true, default: 1 },
        {
          name: 'updated_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
        },
      ],
      constraints: {
        primaryKey: ['domain', 'entity'],
        checks: ['revision > 0'],
      },
    };
    const managedEventsSchema = {
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
        {
          name: 'deduplication_key',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        {
          name: 'occurred_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
          immutable: true,
        },
        { name: 'request_id', type: 'uuid', immutable: true },
        {
          name: 'event_key',
          type: 'varchar(128)',
          notNull: true,
          immutable: true,
        },
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
    const schemas = [
      cellsSchema,
      portalUsersSchema,
      tenantsSchema,
      portalUserTenantsSchema,
      sessionsSchema,
      loginThrottlesSchema,
      platformRolesSchema,
      cellProvisioningSchema,
      provisioningJobsSchema,
      moduleEntitlementsSchema,
      cacheRevisionsSchema,
      managedEventsSchema,
    ];
    for (const schema of schemas)
      await new TableModel(db, pgp, schema).createTable();
    await db.none(`CREATE FUNCTION admin.protect_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW)->col IS DISTINCT FROM to_jsonb(OLD)->col THEN
      RAISE EXCEPTION 'Immutable field' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF to_jsonb(NEW) ? 'updated_at' THEN NEW.updated_at = clock_timestamp(); END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION admin.protect_root() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_root AND (TG_OP='DELETE' OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.status IS DISTINCT FROM OLD.status OR NEW.is_root IS DISTINCT FROM OLD.is_root
    OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at) THEN
    RAISE EXCEPTION 'Protected root' USING ERRCODE='23514';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION admin.protect_membership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_user boolean; owner_tenant boolean;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT is_root INTO root_user FROM admin.portal_users WHERE id=OLD.portal_user_id;
    SELECT is_napsoft INTO owner_tenant FROM admin.tenants WHERE id=OLD.tenant_id FOR UPDATE;
    IF root_user AND owner_tenant THEN
      RAISE EXCEPTION 'Protected root membership' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  SELECT is_napsoft INTO owner_tenant FROM admin.tenants WHERE id=NEW.tenant_id FOR UPDATE;
  SELECT is_root INTO root_user FROM admin.portal_users WHERE id=NEW.portal_user_id;
  IF NEW.member_type IS NULL AND NOT (coalesce(root_user,false) AND coalesce(owner_tenant,false)) THEN
    RAISE EXCEPTION 'Root membership required' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF EXISTS(SELECT 1 FROM admin.portal_users u JOIN admin.tenants t ON t.id=OLD.tenant_id
      WHERE u.id=OLD.portal_user_id AND u.is_root AND t.is_napsoft)
      AND (NEW.portal_user_id IS DISTINCT FROM OLD.portal_user_id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.member_type IS DISTINCT FROM OLD.member_type
        OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.ready IS DISTINCT FROM OLD.ready
        OR NEW.status IS DISTINCT FROM OLD.status OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at) THEN
      RAISE EXCEPTION 'Protected root membership' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION admin.protect_cell_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.cell_id IS NOT NULL AND NEW.cell_id IS DISTINCT FROM OLD.cell_id
    AND (OLD.provisioned OR NEW.provisioned OR EXISTS(SELECT 1 FROM admin.portal_user_tenants WHERE tenant_id=OLD.id)) THEN
    RAISE EXCEPTION 'Cell assignment protected' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE FUNCTION admin.protect_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Append-only event' USING ERRCODE='23514'; END $$;
CREATE TRIGGER protect_root BEFORE UPDATE OR DELETE ON admin.portal_users FOR EACH ROW EXECUTE FUNCTION admin.protect_root();
CREATE TRIGGER protect_membership BEFORE INSERT OR UPDATE OR DELETE ON admin.portal_user_tenants FOR EACH ROW EXECUTE FUNCTION admin.protect_membership();
CREATE TRIGGER protect_cell_assignment BEFORE UPDATE ON admin.tenants FOR EACH ROW EXECUTE FUNCTION admin.protect_cell_assignment();
CREATE TRIGGER protect_event BEFORE UPDATE OR DELETE ON admin.managed_events FOR EACH ROW EXECUTE FUNCTION admin.protect_event();
`);
    for (const schema of schemas) {
      const immutable = schema.columns
        .filter(c => c.immutable)
        .map(c => c.name);
      await db.none(
        'CREATE TRIGGER protect_record BEFORE UPDATE ON admin.$1:name FOR EACH ROW EXECUTE FUNCTION admin.protect_record($2:csv)',
        [schema.table, immutable]
      );
      await db.none('ALTER TABLE admin.$1:name DISABLE ROW LEVEL SECURITY', [
        schema.table,
      ]);
      await db.none('REVOKE ALL ON admin.$1:name FROM PUBLIC, "nap-app"', [
        schema.table,
      ]);
      await db.none(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON admin.$1:name TO "nap-app"',
        [schema.table]
      );
    }
    await db.none(
      'REVOKE ALL ON SCHEMA admin FROM PUBLIC; GRANT USAGE ON SCHEMA admin TO "nap-app"; REVOKE ALL ON admin.schema_migrations FROM PUBLIC, "nap-app"; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA admin FROM PUBLIC;'
    );
  },
});
