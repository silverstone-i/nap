/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline cell migration. It creates the five `cell` tables in dependency
 * order, installs the immutable-field trigger, enables row-level security on
 * the tenant tables, and applies the `nap-app` grant contract.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-cell-tenancy',
  up: async ({ db, pgp }) => {
    const physicalIdentitySchema = {
      dbSchema: 'cell',
      table: 'physical_identity',
      columns: [
        { name: 'cell_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'database_name',
          type: 'varchar(63)',
          notNull: true,
          immutable: true,
        },
        { name: 'operation_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'environment', type: 'text', notNull: true, immutable: true },
        {
          name: 'created_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
          immutable: true,
        },
      ],
      constraints: {
        primaryKey: ['cell_id'],
        checks: ["environment IN ('dev', 'test', 'prod')"],
        indexes: [
          {
            name: 'physical_identity_single_row',
            columns: [{ expression: '(true)' }],
            unique: true,
          },
        ],
      },
    };
    const tenantsSchema = {
      dbSchema: 'cell',
      table: 'tenants',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'tenant_code',
          type: 'varchar(32)',
          notNull: true,
          immutable: true,
        },
        { name: 'status', type: 'text', notNull: true },
        { name: 'revision', type: 'integer', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "status IN ('pending', 'active', 'suspended')",
          'revision > 0',
        ],
      },
    };
    const tenantMembersSchema = {
      dbSchema: 'cell',
      table: 'tenant_members',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        { name: 'member_type', type: 'text' },
        { name: 'member_id', type: 'uuid' },
        { name: 'status', type: 'text', notNull: true },
        { name: 'revision', type: 'integer', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "member_type IS NULL OR member_type IN ('employee', 'client', 'vendor_contact', 'contact')",
          "status IN ('pending', 'active', 'suspended')",
          'revision > 0',
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: { schema: 'cell', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['portal_user_id', 'tenant_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['tenant_id', 'member_id'] },
        ],
      },
    };
    const moduleEntitlementsSchema = {
      dbSchema: 'cell',
      table: 'module_entitlements',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      columns: [
        { name: 'id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'module', type: 'text', notNull: true, immutable: true },
        { name: 'enabled', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'module']],
        checks: ['revision > 0'],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: { schema: 'cell', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
      },
    };
    const outboxSchema = {
      dbSchema: 'cell',
      table: 'outbox',
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
        { name: 'topic', type: 'text', notNull: true, immutable: true },
        { name: 'entity_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'revision', type: 'integer', notNull: true, immutable: true },
        {
          name: 'payload',
          type: 'jsonb',
          notNull: true,
          default: "'{}'::jsonb",
          immutable: true,
        },
        { name: 'status', type: 'text', notNull: true, default: 'pending' },
        { name: 'attempts', type: 'integer', notNull: true, default: 0 },
        {
          name: 'next_attempt_at',
          type: 'timestamptz',
          notNull: true,
          default: 'now()',
        },
        { name: 'delivered_at', type: 'timestamptz' },
        { name: 'failure_code', type: 'varchar(64)' },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "topic IN ('portal_access')",
          "status IN ('pending', 'delivered', 'failed')",
          'revision > 0',
          'attempts >= 0',
          "(status = 'delivered' AND delivered_at IS NOT NULL AND failure_code IS NULL) OR (status <> 'delivered' AND delivered_at IS NULL)",
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: { schema: 'cell', table: 'tenants', columns: ['id'] },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            name: 'outbox_change',
            columns: ['topic', 'entity_id', 'revision'],
            unique: true,
          },
          { columns: ['status', 'next_attempt_at'] },
          { columns: ['tenant_id', 'status'] },
        ],
      },
    };
    const schemas = [
      physicalIdentitySchema,
      tenantsSchema,
      tenantMembersSchema,
      moduleEntitlementsSchema,
      outboxSchema,
    ];
    for (const schema of schemas)
      await new TableModel(db, pgp, schema).createTable();
    await db.none(`CREATE FUNCTION cell.protect_record() RETURNS trigger LANGUAGE plpgsql AS $$
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
    // RLS column per tenant table; `physical_identity` holds no tenant data.
    const tenantColumn = {
      tenants: 'id',
      tenant_members: 'tenant_id',
      module_entitlements: 'tenant_id',
      outbox: 'tenant_id',
    };
    for (const schema of schemas) {
      const immutable = schema.columns
        .filter(c => c.immutable)
        .map(c => c.name);
      await db.none(
        'CREATE TRIGGER protect_record BEFORE UPDATE ON cell.$1:name FOR EACH ROW EXECUTE FUNCTION cell.protect_record($2:csv)',
        [schema.table, immutable]
      );
      await db.none('REVOKE ALL ON cell.$1:name FROM PUBLIC, "nap-app"', [
        schema.table,
      ]);
      const column = tenantColumn[schema.table];
      if (!column) {
        await db.none('GRANT SELECT ON cell.$1:name TO "nap-app"', [
          schema.table,
        ]);
        continue;
      }
      await db.none(
        'GRANT SELECT, INSERT, UPDATE, DELETE ON cell.$1:name TO "nap-app"',
        [schema.table]
      );
      await db.none('ALTER TABLE cell.$1:name ENABLE ROW LEVEL SECURITY', [
        schema.table,
      ]);
      await db.none(
        "CREATE POLICY tenant_isolation ON cell.$1:name TO \"nap-app\" USING ($2:name = NULLIF(current_setting('nap.tenant_id', true), '')::uuid) WITH CHECK ($2:name = NULLIF(current_setting('nap.tenant_id', true), '')::uuid)",
        [schema.table, column]
      );
    }
    await db.none(
      'REVOKE ALL ON SCHEMA cell FROM PUBLIC; GRANT USAGE ON SCHEMA cell TO "nap-app"; REVOKE ALL ON cell.schema_migrations FROM PUBLIC, "nap-app"; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA cell FROM PUBLIC;'
    );
  },
});
