/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen authorization tables. Called by: explicit database migration. */
export const migration = defineMigration({
  id: '002-rbac',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'companies',
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
        { name: 'code', type: 'text', notNull: true },
        { name: 'name', type: 'text', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        foreignKeys: [],
        checks: [],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE app.companies ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.companies ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.companies USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.companies_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.companies FOR EACH ROW EXECUTE FUNCTION app.companies_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'roles',
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
        { name: 'code', type: 'text', notNull: true, immutable: true },
        { name: 'name', type: 'text', notNull: true },
        { name: 'permanent', type: 'boolean', notNull: true, default: false },
        {
          name: 'capabilities',
          type: 'jsonb',
          notNull: true,
          default: "'[]'::jsonb",
        },
        {
          name: 'fields',
          type: 'jsonb',
          notNull: true,
          default: "'[]'::jsonb",
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'id'],
          ['tenant_id', 'code'],
        ],
        foreignKeys: [],
        checks: [],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE app.roles ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.roles USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.roles_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.roles FOR EACH ROW EXECUTE FUNCTION app.roles_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'role_assignments',
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
        { name: 'role_id', type: 'uuid', notNull: true },
        { name: 'binding_id', type: 'uuid', notNull: true },
        { name: 'scope', type: 'text', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'role_id'],
            references: {
              schema: 'app',
              table: 'roles',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'binding_id'],
            references: {
              schema: 'cell',
              table: 'tenant_user_bindings',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        checks: [
          "scope IN ('self','companies','projects','all_companies','all_projects','company_projects','tenant')",
        ],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE app.role_assignments ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.role_assignments ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.role_assignments USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.role_assignments_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.role_assignments FOR EACH ROW EXECUTE FUNCTION app.role_assignments_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'assignment_companies',
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
        { name: 'assignment_id', type: 'uuid', notNull: true },
        { name: 'company_id', type: 'uuid', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'id'],
          ['tenant_id', 'assignment_id', 'company_id'],
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'assignment_id'],
            references: {
              schema: 'app',
              table: 'role_assignments',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'company_id'],
            references: {
              schema: 'app',
              table: 'companies',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        checks: [],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE app.assignment_companies ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.assignment_companies ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.assignment_companies USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.assignment_companies_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.assignment_companies FOR EACH ROW EXECUTE FUNCTION app.assignment_companies_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'access_events',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: false,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'operator_id', type: 'uuid', notNull: true },
        { name: 'event', type: 'text', notNull: true },
        { name: 'detail', type: 'jsonb', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        foreignKeys: [],
        checks: [],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE app.access_events ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.access_events ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.access_events USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.access_events_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable audit' USING ERRCODE='23514'; END $$; CREATE TRIGGER immutable_event BEFORE UPDATE OR DELETE ON app.access_events FOR EACH ROW EXECUTE FUNCTION app.access_events_immutable();`
    );
  },
});
