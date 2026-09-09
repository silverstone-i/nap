/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen authorization tables. Called by: explicit database migration. */
export const migration = defineMigration({
  id: '001-projects',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'projects',
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
        { name: 'company_id', type: 'uuid', notNull: true, immutable: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        foreignKeys: [
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
      `ALTER TABLE app.projects ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.projects ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.projects USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.projects_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.projects FOR EACH ROW EXECUTE FUNCTION app.projects_stamp();`
    );
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'assignment_projects',
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
        { name: 'project_id', type: 'uuid', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'id'],
          ['tenant_id', 'assignment_id', 'project_id'],
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
            columns: ['tenant_id', 'project_id'],
            references: {
              schema: 'app',
              table: 'projects',
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
      `ALTER TABLE app.assignment_projects ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE app.assignment_projects ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON app.assignment_projects USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION app.assignment_projects_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON app.assignment_projects FOR EACH ROW EXECUTE FUNCTION app.assignment_projects_stamp();`
    );
  },
});
