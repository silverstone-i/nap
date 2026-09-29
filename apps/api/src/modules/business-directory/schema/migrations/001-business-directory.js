/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/**
 * Baseline `business-directory` migration (M0005). It creates the eight
 * `app` directory tables in dependency order, attaches the existing
 * `app.protect_record()` trigger function from `001-access-control`, enables
 * and forces row-level security with the tenant rule from M0002-01-R006,
 * and applies the `nap-app` grant contract.
 *
 * Schema objects are copied here rather than imported so the migration
 * checksum covers the whole contract. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '001-business-directory',
  up: async ({ db, pgp }) => {
    const partiesSchema = {
      dbSchema: 'app',
      table: 'parties',
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
        { name: 'kind', type: 'varchar(32)', notNull: true, immutable: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        checks: [
          "kind IN ('employee', 'contact', 'vendor', 'client', 'vendor_contact', 'client_contact')",
        ],
      },
    };
    const peopleSchema = {
      dbSchema: 'app',
      table: 'people',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'first_name', type: 'varchar(160)', notNull: true },
        { name: 'last_name', type: 'varchar(160)', notNull: true },
        { name: 'tax_id_encrypted', type: 'text' },
        { name: 'tax_id_hash', type: 'char(64)' },
        { name: 'tax_id_last4', type: 'char(4)' },
        {
          name: 'is_portal_user',
          type: 'boolean',
          notNull: true,
          default: false,
        },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['party_id'],
        unique: [['tenant_id', 'party_id']],
        checks: [
          'revision > 0',
          '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
          "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
          "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'parties',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [{ columns: ['tenant_id', 'tax_id_hash'] }],
      },
    };
    const organizationsSchema = {
      dbSchema: 'app',
      table: 'organizations',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'legal_name', type: 'varchar(255)', notNull: true },
        { name: 'dba_name', type: 'varchar(255)' },
        { name: 'tax_id_encrypted', type: 'text' },
        { name: 'tax_id_hash', type: 'char(64)' },
        { name: 'tax_id_last4', type: 'char(4)' },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['party_id'],
        unique: [['tenant_id', 'party_id']],
        checks: [
          'revision > 0',
          '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
          "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
          "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'parties',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [{ columns: ['tenant_id', 'tax_id_hash'] }],
      },
    };
    const organizationContactsSchema = {
      dbSchema: 'app',
      table: 'organization_contacts',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        {
          name: 'organization_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        { name: 'full_name', type: 'varchar(255)', notNull: true },
        { name: 'tax_id_encrypted', type: 'text' },
        { name: 'tax_id_hash', type: 'char(64)' },
        { name: 'tax_id_last4', type: 'char(4)' },
        {
          name: 'is_portal_user',
          type: 'boolean',
          notNull: true,
          default: false,
        },
        {
          name: 'is_primary_tax_contact',
          type: 'boolean',
          notNull: true,
          default: false,
        },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['party_id'],
        checks: [
          'revision > 0',
          '(tax_id_encrypted IS NULL) = (tax_id_hash IS NULL) AND (tax_id_hash IS NULL) = (tax_id_last4 IS NULL)',
          "tax_id_hash IS NULL OR tax_id_hash ~ '^[0-9a-f]{64}$'",
          "tax_id_last4 IS NULL OR tax_id_last4 ~ '^[0-9]{4}$'",
          'NOT is_primary_tax_contact OR tax_id_hash IS NOT NULL',
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'parties',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'organization_id'],
            references: {
              schema: 'app',
              table: 'organizations',
              columns: ['tenant_id', 'party_id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['organization_id'],
            unique: true,
            where: 'is_primary_tax_contact AND deactivated_at IS NULL',
          },
          { columns: ['organization_id'] },
          { columns: ['tenant_id', 'tax_id_hash'] },
        ],
      },
    };
    const contactLabelsSchema = {
      dbSchema: 'app',
      table: 'contact_labels',
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
          name: 'applies_to',
          type: 'varchar(16)',
          notNull: true,
          immutable: true,
        },
        { name: 'name', type: 'varchar(64)', notNull: true },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'id'],
          ['tenant_id', 'applies_to', 'name'],
        ],
        checks: ["applies_to IN ('email', 'phone', 'address')", 'revision > 0'],
      },
    };
    const contactMethodsSchema = {
      dbSchema: 'app',
      table: 'contact_methods',
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
        { name: 'type', type: 'varchar(16)', notNull: true, immutable: true },
        { name: 'value', type: 'varchar(254)', notNull: true },
        { name: 'label_id', type: 'uuid' },
        { name: 'is_primary', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["type IN ('email', 'phone')", 'revision > 0'],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'parties',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'label_id'],
            references: {
              schema: 'app',
              table: 'contact_labels',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['party_id', 'type'],
            unique: true,
            where: 'is_primary AND deactivated_at IS NULL',
          },
          { columns: ['party_id'] },
        ],
      },
    };
    const addressesSchema = {
      dbSchema: 'app',
      table: 'addresses',
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
        { name: 'line1', type: 'varchar(255)', notNull: true },
        { name: 'line2', type: 'varchar(255)' },
        { name: 'city', type: 'varchar(120)', notNull: true },
        { name: 'region', type: 'varchar(120)' },
        { name: 'postal_code', type: 'varchar(32)' },
        { name: 'country', type: 'char(2)', notNull: true },
        { name: 'label_id', type: 'uuid' },
        { name: 'is_primary', type: 'boolean', notNull: true, default: false },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ['revision > 0'],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'parties',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'label_id'],
            references: {
              schema: 'app',
              table: 'contact_labels',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['country'],
            references: {
              schema: 'reference',
              table: 'countries',
              columns: ['code'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['party_id'],
            unique: true,
            where: 'is_primary AND deactivated_at IS NULL',
          },
          { columns: ['party_id'] },
        ],
      },
    };
    const tenantContactsSchema = {
      dbSchema: 'app',
      table: 'tenant_contacts',
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
        {
          name: 'designation',
          type: 'varchar(16)',
          notNull: true,
          immutable: true,
        },
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["designation IN ('primary', 'billing')", 'revision > 0'],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'party_id'],
            references: {
              schema: 'app',
              table: 'people',
              columns: ['tenant_id', 'party_id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        indexes: [
          {
            columns: ['party_id', 'designation'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          { columns: ['designation'] },
        ],
      },
    };
    const schemas = [
      partiesSchema,
      peopleSchema,
      organizationsSchema,
      organizationContactsSchema,
      contactLabelsSchema,
      contactMethodsSchema,
      addressesSchema,
      tenantContactsSchema,
    ];
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
