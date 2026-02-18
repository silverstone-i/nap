/**
 * @file Migration: add RBAC Layers 2-4 tables and scope column
 * @module core/schema/migrations/202502180012_rbacScopeTables
 *
 * Adds:
 *   - `scope` column to existing `roles` table (Layer 2)
 *   - `project_members` table (Layer 2 — user-to-project assignment)
 *   - `company_members` table (Layer 2 — user-to-company assignment)
 *   - `state_filters` table (Layer 3 — record-status visibility)
 *   - `field_group_definitions` table (Layer 4 — named column groups)
 *   - `field_group_grants` table (Layer 4 — role-to-group assignment)
 *   - `policy_catalog` table (RBAC registry of valid module/router/action combinations)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202502180012-rbac-scope-tables',
  description:
    'Add scope to roles; create project_members, state_filters, field_group_definitions, field_group_grants',

  async up({ schema, db, pgp, models }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    // ── Layer 2: Add scope column to roles ──────────────────────────────
    await db.none(
      `ALTER TABLE ${s}.roles ADD COLUMN IF NOT EXISTS scope varchar(32) NOT NULL DEFAULT 'all_projects'`,
    );
    // Guard against duplicate constraint (idempotent)
    await db.none(`
      DO $$ BEGIN
        ALTER TABLE ${s}.roles
          ADD CONSTRAINT roles_scope_check CHECK (scope IN ('all_projects','assigned_companies','assigned_projects'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // ── Create new tables in dependency order ───────────────────────────
    // state_filters depends on roles (FK)
    if (models.stateFilters) await models.stateFilters.createTable();

    // field_group_definitions has no FK deps
    if (models.fieldGroupDefinitions) await models.fieldGroupDefinitions.createTable();

    // field_group_grants depends on roles + field_group_definitions
    if (models.fieldGroupGrants) await models.fieldGroupGrants.createTable();

    // project_members — table created without FK (cross-module dep on projects)
    if (models.projectMembers) await models.projectMembers.createTable();

    // company_members — table created without FK (cross-module dep on inter_companies)
    if (models.companyMembers) await models.companyMembers.createTable();

    // policy_catalog — no FK deps
    if (models.policyCatalog) await models.policyCatalog.createTable();

    // Add FK from project_members → projects after table exists
    // Uses the circular-FK pattern: ALTER TABLE after creation
    const projectsExists = await db.oneOrNone(
      'SELECT to_regclass($1) AS exists',
      [`${schema}.projects`],
    );
    if (projectsExists?.exists) {
      await db.none(`
        DO $$ BEGIN
          ALTER TABLE ${s}.project_members
            ADD CONSTRAINT fk_project_members_project_id
            FOREIGN KEY (project_id) REFERENCES ${s}.projects(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    }

    // Add FK from company_members → inter_companies after table exists
    const interCompaniesExists = await db.oneOrNone(
      'SELECT to_regclass($1) AS exists',
      [`${schema}.inter_companies`],
    );
    if (interCompaniesExists?.exists) {
      await db.none(`
        DO $$ BEGIN
          ALTER TABLE ${s}.company_members
            ADD CONSTRAINT fk_company_members_company_id
            FOREIGN KEY (company_id) REFERENCES ${s}.inter_companies(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
      `);
    }
  },

  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    await db.none(`DROP TABLE IF EXISTS ${s}.policy_catalog CASCADE`);
    await db.none(`DROP TABLE IF EXISTS ${s}.company_members CASCADE`);
    await db.none(`DROP TABLE IF EXISTS ${s}.field_group_grants CASCADE`);
    await db.none(`DROP TABLE IF EXISTS ${s}.field_group_definitions CASCADE`);
    await db.none(`DROP TABLE IF EXISTS ${s}.state_filters CASCADE`);
    await db.none(`DROP TABLE IF EXISTS ${s}.project_members CASCADE`);
    await db.none(`ALTER TABLE ${s}.roles DROP COLUMN IF EXISTS scope`);
    await db.none(`
      DO $$ BEGIN
        ALTER TABLE ${s}.roles DROP CONSTRAINT IF EXISTS roles_scope_check;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$
    `);
  },
});
