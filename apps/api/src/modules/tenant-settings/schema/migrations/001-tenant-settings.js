/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline `tenant-settings` migration (M0006). It creates
 * `app.tenant_settings`, `app.file_storage`, and `app.files`, attaches the existing `app.protect_record()`
 * trigger function from `001-access-control`, enables and forces row-level
 * security with the tenant rule from M0002-01-R006, and applies the
 * `nap-app` grant contract.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-tenant-settings',
  up: async ({ db, pgp }) => {
    const tenantSettingsSchema = {
      dbSchema: 'app',
      table: 'tenant_settings',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      columns: [
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'settings',
          type: 'jsonb',
          notNull: true,
          default: "'{}'::jsonb",
        },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['tenant_id'],
        checks: ["jsonb_typeof(settings) = 'object'", 'revision > 0'],
      },
    };
    const fileStorageSchema = {
      dbSchema: 'app',
      table: 'file_storage',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      columns: [
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'endpoint', type: 'text', notNull: true },
        { name: 'region', type: 'text', notNull: true },
        { name: 'bucket', type: 'text', notNull: true },
        { name: 'access_key_id', type: 'text', notNull: true },
        { name: 'secret_encrypted', type: 'text', notNull: true },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['tenant_id'],
        checks: ["endpoint ~ '^https://'", 'revision > 0'],
      },
    };
    const filesSchema = {
      dbSchema: 'app',
      table: 'files',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'purpose', type: 'text', notNull: true, immutable: true },
        { name: 'object_key', type: 'text', notNull: true, immutable: true },
        { name: 'content_type', type: 'text', notNull: true },
        { name: 'size_bytes', type: 'integer', notNull: true },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'object_key']],
        checks: [
          "purpose IN ('logo', 'profile_image')",
          "content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')",
          'size_bytes BETWEEN 1 AND 2097152',
          'revision > 0',
        ],
        indexes: [
          {
            columns: ['tenant_id'],
            unique: true,
            where: "purpose = 'logo' AND deactivated_at IS NULL",
          },
        ],
      },
    };
    const schemas = [tenantSettingsSchema, fileStorageSchema, filesSchema];
    for (const schema of schemas)
      await new TableModel(db, pgp, schema).createTable();
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
  },
});
