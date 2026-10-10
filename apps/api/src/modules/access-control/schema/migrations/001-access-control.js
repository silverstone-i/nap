/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline `access-control` migration (M0003, I0010). It creates the four `app`
 * role tables in dependency order, installs the immutable-field trigger,
 * enables and forces row-level security with the tenant rule from
 * M0002-01-R006, and applies the `nap-app` grant contract.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-access-control',
  up: async ({ db, pgp }) => {
    const rolesSchema = {
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
        { name: 'code', type: 'varchar(64)', notNull: true, immutable: true },
        { name: 'name', type: 'varchar(160)', notNull: true },
        { name: 'description', type: 'varchar(512)' },
        {
          name: 'is_immutable',
          type: 'boolean',
          notNull: true,
          default: false,
          immutable: true,
        },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'code'],
          ['tenant_id', 'id'],
        ],
        checks: ['revision > 0'],
      },
    };
    const roleGrantsSchema = {
      dbSchema: 'app',
      table: 'role_grants',
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
        { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'pattern',
          type: 'varchar(255)',
          notNull: true,
          immutable: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['role_id', 'pattern']],
        checks: [
          "pattern ~ '^([A-Z0-9_-]+|\\*)::([a-z0-9-]+|\\*)::([a-z0-9-]+|\\*)::([a-z0-9-]+|\\*)$'",
        ],
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
        ],
      },
    };
    const roleAssignmentsSchema = {
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
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
      ],
      constraints: {
        primaryKey: ['id'],
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
        ],
        indexes: [
          {
            columns: ['portal_user_id', 'role_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['role_id'] },
        ],
      },
    };
    // I0010-R006: roles chosen for a person who is not yet an active member.
    const heldRolesSchema = {
      dbSchema: 'app',
      table: 'held_roles',
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
        { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
      ],
      constraints: {
        primaryKey: ['id'],
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
        ],
        indexes: [
          {
            columns: ['party_id', 'role_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['role_id'] },
        ],
      },
    };
    const schemas = [
      rolesSchema,
      roleGrantsSchema,
      roleAssignmentsSchema,
      heldRolesSchema,
    ];
    for (const schema of schemas)
      await new TableModel(db, pgp, schema).createTable();
    await db.none(`CREATE FUNCTION app.protect_record() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE col text;
BEGIN
  FOREACH col IN ARRAY TG_ARGV LOOP
    IF to_jsonb(NEW)->col IS DISTINCT FROM to_jsonb(OLD)->col THEN
      RAISE EXCEPTION 'Immutable field' USING ERRCODE='23514';
    END IF;
  END LOOP;
  IF to_jsonb(NEW) ? 'updated_at' THEN NEW.updated_at = clock_timestamp(); END IF;
  RETURN NEW;
END $$;`);
    for (const schema of schemas) {
      const immutable = schema.columns
        .filter(c => c.immutable)
        .map(c => c.name);
      await db.none(
        'CREATE TRIGGER protect_record BEFORE UPDATE ON app.$1:name FOR EACH ROW EXECUTE FUNCTION app.protect_record($2:csv)',
        [schema.table, immutable]
      );
      // M0002-01-R006: with no tenant setting, a query returns no rows.
      // FORCE applies the rule to the owner (`nap-admin`) as well.
      await db.none(
        'ALTER TABLE app.$1:name ENABLE ROW LEVEL SECURITY; ALTER TABLE app.$1:name FORCE ROW LEVEL SECURITY',
        [schema.table]
      );
      await db.none(
        "CREATE POLICY tenant_isolation ON app.$1:name USING (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid)",
        [schema.table]
      );
      await db.none('REVOKE ALL ON app.$1:name FROM PUBLIC, "nap-app"', [
        schema.table,
      ]);
      await db.none(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON app.$1:name TO "nap-app"',
        [schema.table]
      );
    }
    await db.none(
      'REVOKE ALL ON SCHEMA app FROM PUBLIC; GRANT USAGE ON SCHEMA app TO "nap-app"; REVOKE ALL ON app.schema_migrations FROM PUBLIC, "nap-app"; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;'
    );
  },
});
