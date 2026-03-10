/**
 * @file Migration: add tax_identifiers table, integrate inter_companies with sources,
 *       and migrate existing tax_id data from vendors/clients/contacts/inter_companies.
 * @module core/schema/migrations/202503090014_taxIdentifiers
 *
 * Steps per tenant schema:
 *   1. Update sources CHECK constraint to include 'inter_company'
 *   2. Add source_id column to inter_companies
 *   3. Backfill: create sources records for inter_companies + contacts missing them
 *   4. Set inter_companies.source_id FK constraint
 *   5. Create tax_identifiers table
 *   6. Migrate existing tax_id data to tax_identifiers rows
 *   7. Drop tax_id columns from vendors, clients, contacts, inter_companies
 *   8. Add tax-identifiers entry to policy_catalog
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';
import { isTableModel } from '../../../../db/migrations/modelPlanner.js';

export default defineMigration({
  id: '202503090014-tax-identifiers',
  description: 'Add tax_identifiers table, integrate inter_companies with sources, migrate tax_id data',

  async up({ schema, models, db, pgp }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    // 1. Update sources CHECK constraint to include 'inter_company'
    //    Drop the old constraint and add the new one
    const checkConstraints = await db.any(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = '${schema}.sources'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%source_type%'`,
    );
    for (const { conname } of checkConstraints) {
      await db.none(`ALTER TABLE ${s}.sources DROP CONSTRAINT ${pgp.as.name(conname)}`);
    }
    await db.none(
      `ALTER TABLE ${s}.sources ADD CONSTRAINT sources_source_type_check
       CHECK (source_type IN ('vendor', 'client', 'employee', 'contact', 'inter_company'))`,
    );

    // 2. Add source_id column to inter_companies (if not present)
    const hasSourceId = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'inter_companies' AND column_name = 'source_id'`,
      [schema],
    );
    if (!hasSourceId) {
      await db.none(`ALTER TABLE ${s}.inter_companies ADD COLUMN source_id uuid`);
    }

    // 3. Backfill: create sources records for inter_companies missing them
    const icsWithoutSource = await db.any(
      `SELECT id, tenant_id, name FROM ${s}.inter_companies WHERE source_id IS NULL`,
    );
    for (const ic of icsWithoutSource) {
      const source = await db.one(
        `INSERT INTO ${s}.sources (tenant_id, table_id, source_type, label)
         VALUES ($1, $2, 'inter_company', $3) RETURNING id`,
        [ic.tenant_id, ic.id, ic.name],
      );
      await db.none(
        `UPDATE ${s}.inter_companies SET source_id = $1 WHERE id = $2`,
        [source.id, ic.id],
      );
    }

    // Backfill: create sources records for contacts missing them
    const contactsWithoutSource = await db.any(
      `SELECT id, tenant_id, name FROM ${s}.contacts WHERE source_id IS NULL AND deactivated_at IS NULL`,
    );
    for (const c of contactsWithoutSource) {
      const source = await db.one(
        `INSERT INTO ${s}.sources (tenant_id, table_id, source_type, label)
         VALUES ($1, $2, 'contact', $3) RETURNING id`,
        [c.tenant_id, c.id, c.name],
      );
      await db.none(
        `UPDATE ${s}.contacts SET source_id = $1 WHERE id = $2`,
        [source.id, c.id],
      );
    }

    // 4. Add FK constraint on inter_companies.source_id
    const hasFk = await db.oneOrNone(
      `SELECT 1 FROM pg_constraint
       WHERE conrelid = '${schema}.inter_companies'::regclass
         AND contype = 'f'
         AND pg_get_constraintdef(oid) LIKE '%sources%'`,
    );
    if (!hasFk) {
      await db.none(
        `ALTER TABLE ${s}.inter_companies
         ADD CONSTRAINT inter_companies_source_id_fkey
         FOREIGN KEY (source_id) REFERENCES ${s}.sources(id) ON DELETE CASCADE`,
      );
    }

    // 5. Create tax_identifiers table
    const taxIdModel = Object.values(models).find(
      (m) => isTableModel(m) && m.schema?.table === 'tax_identifiers',
    );
    if (taxIdModel) {
      await taxIdModel.createTable();
    }

    // 6. Migrate existing tax_id data to tax_identifiers rows
    //    Vendor tax_ids
    const hasTaxIdVendors = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'vendors' AND column_name = 'tax_id'`,
      [schema],
    );
    if (hasTaxIdVendors) {
      const vendorTaxIds = await db.any(
        `SELECT v.source_id, v.tax_id FROM ${s}.vendors v
         WHERE v.tax_id IS NOT NULL AND v.tax_id != '' AND v.source_id IS NOT NULL`,
      );
      for (const { source_id, tax_id } of vendorTaxIds) {
        await db.none(
          `INSERT INTO ${s}.tax_identifiers (source_id, country_code, tax_type, tax_value, is_primary)
           VALUES ($1, 'US', 'TIN', $2, true)
           ON CONFLICT DO NOTHING`,
          [source_id, tax_id],
        );
      }
    }

    //    Client tax_ids
    const hasTaxIdClients = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'clients' AND column_name = 'tax_id'`,
      [schema],
    );
    if (hasTaxIdClients) {
      const clientTaxIds = await db.any(
        `SELECT c.source_id, c.tax_id FROM ${s}.clients c
         WHERE c.tax_id IS NOT NULL AND c.tax_id != '' AND c.source_id IS NOT NULL`,
      );
      for (const { source_id, tax_id } of clientTaxIds) {
        await db.none(
          `INSERT INTO ${s}.tax_identifiers (source_id, country_code, tax_type, tax_value, is_primary)
           VALUES ($1, 'US', 'TIN', $2, true)
           ON CONFLICT DO NOTHING`,
          [source_id, tax_id],
        );
      }
    }

    //    Contact tax_ids
    const hasTaxIdContacts = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'contacts' AND column_name = 'tax_id'`,
      [schema],
    );
    if (hasTaxIdContacts) {
      const contactTaxIds = await db.any(
        `SELECT c.source_id, c.tax_id FROM ${s}.contacts c
         WHERE c.tax_id IS NOT NULL AND c.tax_id != '' AND c.source_id IS NOT NULL`,
      );
      for (const { source_id, tax_id } of contactTaxIds) {
        await db.none(
          `INSERT INTO ${s}.tax_identifiers (source_id, country_code, tax_type, tax_value, is_primary)
           VALUES ($1, 'US', 'TIN', $2, true)
           ON CONFLICT DO NOTHING`,
          [source_id, tax_id],
        );
      }
    }

    //    Inter-company tax_ids
    const hasTaxIdIc = await db.oneOrNone(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'inter_companies' AND column_name = 'tax_id'`,
      [schema],
    );
    if (hasTaxIdIc) {
      const icTaxIds = await db.any(
        `SELECT ic.source_id, ic.tax_id FROM ${s}.inter_companies ic
         WHERE ic.tax_id IS NOT NULL AND ic.tax_id != '' AND ic.source_id IS NOT NULL`,
      );
      for (const { source_id, tax_id } of icTaxIds) {
        await db.none(
          `INSERT INTO ${s}.tax_identifiers (source_id, country_code, tax_type, tax_value, is_primary)
           VALUES ($1, 'US', 'TIN', $2, true)
           ON CONFLICT DO NOTHING`,
          [source_id, tax_id],
        );
      }
    }

    // 7. Drop views that depend on tax_id columns, then drop columns, then recreate views
    await db.none(`DROP VIEW IF EXISTS ${s}.vw_export_contacts CASCADE`);

    if (hasTaxIdVendors) {
      await db.none(`ALTER TABLE ${s}.vendors DROP COLUMN IF EXISTS tax_id`);
    }
    if (hasTaxIdClients) {
      await db.none(`ALTER TABLE ${s}.clients DROP COLUMN IF EXISTS tax_id`);
    }
    if (hasTaxIdContacts) {
      await db.none(`ALTER TABLE ${s}.contacts DROP COLUMN IF EXISTS tax_id`);
    }
    if (hasTaxIdIc) {
      await db.none(`ALTER TABLE ${s}.inter_companies DROP COLUMN IF EXISTS tax_id`);
    }

    // Recreate vw_export_contacts without tax_id
    await db.none(`
      CREATE OR REPLACE VIEW ${s}.vw_export_contacts AS
      SELECT
        c.id,
        c.tenant_id,
        c.source_id,
        src.source_type,
        src.table_id     AS entity_id,
        src.label        AS entity_label,
        c.name,
        c.code,
        c.email,
        c.is_app_user,
        c.is_active,
        c.created_at,
        c.updated_at
      FROM ${s}.contacts c
      LEFT JOIN ${s}.sources src ON src.id = c.source_id AND src.deactivated_at IS NULL
      WHERE c.deactivated_at IS NULL
    `);

    // 8. Add tax-identifiers entry to policy_catalog
    const existing = await db.oneOrNone(
      `SELECT id FROM ${s}.policy_catalog WHERE module = 'core' AND router = 'tax-identifiers' AND action IS NULL`,
    );
    if (!existing) {
      await db.none(
        `INSERT INTO ${s}.policy_catalog (module, router, action, label, description, sort_order, policy_required, available_fields)
         VALUES ('core', 'tax-identifiers', NULL, 'Tax Identifiers', 'Tax IDs linked to entities via sources', 175, false, $1)`,
        [['country_code', 'tax_type', 'tax_value', 'is_primary']],
      );
    }

    // Update available_fields for vendors/clients/contacts/inter-companies (remove tax_id)
    for (const router of ['vendors', 'clients', 'contacts', 'inter-companies']) {
      await db.none(
        `UPDATE ${s}.policy_catalog
         SET available_fields = array_remove(available_fields, 'tax_id')
         WHERE module = 'core' AND router = $1 AND action IS NULL
           AND available_fields @> ARRAY['tax_id']`,
        [router],
      );
    }
  },

  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    // Re-add tax_id columns
    await db.none(`ALTER TABLE ${s}.vendors ADD COLUMN IF NOT EXISTS tax_id varchar(32)`);
    await db.none(`ALTER TABLE ${s}.clients ADD COLUMN IF NOT EXISTS tax_id varchar(32)`);
    await db.none(`ALTER TABLE ${s}.contacts ADD COLUMN IF NOT EXISTS tax_id varchar(32)`);
    await db.none(`ALTER TABLE ${s}.inter_companies ADD COLUMN IF NOT EXISTS tax_id varchar(32)`);

    // Migrate primary tax_identifiers back to tax_id columns
    await db.none(
      `UPDATE ${s}.vendors v SET tax_id = ti.tax_value
       FROM ${s}.tax_identifiers ti
       WHERE ti.source_id = v.source_id AND ti.is_primary = true AND ti.deactivated_at IS NULL`,
    );
    await db.none(
      `UPDATE ${s}.clients c SET tax_id = ti.tax_value
       FROM ${s}.tax_identifiers ti
       WHERE ti.source_id = c.source_id AND ti.is_primary = true AND ti.deactivated_at IS NULL`,
    );
    await db.none(
      `UPDATE ${s}.contacts c SET tax_id = ti.tax_value
       FROM ${s}.tax_identifiers ti
       WHERE ti.source_id = c.source_id AND ti.is_primary = true AND ti.deactivated_at IS NULL`,
    );
    await db.none(
      `UPDATE ${s}.inter_companies ic SET tax_id = ti.tax_value
       FROM ${s}.tax_identifiers ti
       WHERE ti.source_id = ic.source_id AND ti.is_primary = true AND ti.deactivated_at IS NULL`,
    );

    // Drop tax_identifiers table
    await db.none(`DROP TABLE IF EXISTS ${s}.tax_identifiers CASCADE`);

    // Remove tax-identifiers catalog entry
    await db.none(
      `DELETE FROM ${s}.policy_catalog WHERE module = 'core' AND router = 'tax-identifiers'`,
    );

    // Remove inter_companies FK and source_id
    await db.none(
      `ALTER TABLE ${s}.inter_companies DROP CONSTRAINT IF EXISTS inter_companies_source_id_fkey`,
    );
    await db.none(`ALTER TABLE ${s}.inter_companies DROP COLUMN IF EXISTS source_id`);

    // Revert sources CHECK constraint
    const checkConstraints = await db.any(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = '${schema}.sources'::regclass
         AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%source_type%'`,
    );
    for (const { conname } of checkConstraints) {
      await db.none(`ALTER TABLE ${s}.sources DROP CONSTRAINT ${pgp.as.name(conname)}`);
    }
    await db.none(
      `ALTER TABLE ${s}.sources ADD CONSTRAINT sources_source_type_check
       CHECK (source_type IN ('vendor', 'client', 'employee', 'contact'))`,
    );
  },
});
