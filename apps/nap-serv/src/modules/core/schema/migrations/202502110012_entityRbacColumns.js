/**
 * @file Migration: add RBAC and PRD-required columns to entity tables
 * @module core/schema/migrations/202502110012_entityRbacColumns
 *
 * Adds: roles text[], is_primary_contact, is_billing_contact to employees;
 *       roles text[], is_app_user to vendors;
 *       email, tax_id, roles text[], is_app_user to clients;
 *       roles text[], is_app_user, is_active to contacts.
 *
 * Uses ADD COLUMN IF NOT EXISTS so the migration is safe on both fresh
 * databases (where createTable already applied the columns) and existing
 * databases upgraded in place.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202502110012-entity-rbac-columns',
  description: 'Add roles, is_app_user, and PRD-required columns to entity tables',

  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    // ── employees ──────────────────────────────────────────────
    await db.none(`ALTER TABLE ${s}.employees ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}'`);
    await db.none(
      `ALTER TABLE ${s}.employees ADD COLUMN IF NOT EXISTS is_primary_contact boolean NOT NULL DEFAULT false`,
    );
    await db.none(
      `ALTER TABLE ${s}.employees ADD COLUMN IF NOT EXISTS is_billing_contact boolean NOT NULL DEFAULT false`,
    );

    // ── vendors ────────────────────────────────────────────────
    await db.none(`ALTER TABLE ${s}.vendors ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}'`);
    await db.none(`ALTER TABLE ${s}.vendors ADD COLUMN IF NOT EXISTS is_app_user boolean NOT NULL DEFAULT false`);

    // ── clients ────────────────────────────────────────────────
    await db.none(`ALTER TABLE ${s}.clients ADD COLUMN IF NOT EXISTS email varchar(128) DEFAULT NULL`);
    await db.none(`ALTER TABLE ${s}.clients ADD COLUMN IF NOT EXISTS tax_id varchar(32)`);
    await db.none(`ALTER TABLE ${s}.clients ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}'`);
    await db.none(`ALTER TABLE ${s}.clients ADD COLUMN IF NOT EXISTS is_app_user boolean NOT NULL DEFAULT false`);

    // ── contacts ───────────────────────────────────────────────
    await db.none(`ALTER TABLE ${s}.contacts ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}'`);
    await db.none(`ALTER TABLE ${s}.contacts ADD COLUMN IF NOT EXISTS is_app_user boolean NOT NULL DEFAULT false`);
    await db.none(`ALTER TABLE ${s}.contacts ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true`);
  },

  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;

    const s = pgp.as.name(schema);

    await db.none(`ALTER TABLE ${s}.employees DROP COLUMN IF EXISTS roles`);
    await db.none(`ALTER TABLE ${s}.employees DROP COLUMN IF EXISTS is_primary_contact`);
    await db.none(`ALTER TABLE ${s}.employees DROP COLUMN IF EXISTS is_billing_contact`);

    await db.none(`ALTER TABLE ${s}.vendors DROP COLUMN IF EXISTS roles`);
    await db.none(`ALTER TABLE ${s}.vendors DROP COLUMN IF EXISTS is_app_user`);

    await db.none(`ALTER TABLE ${s}.clients DROP COLUMN IF EXISTS email`);
    await db.none(`ALTER TABLE ${s}.clients DROP COLUMN IF EXISTS tax_id`);
    await db.none(`ALTER TABLE ${s}.clients DROP COLUMN IF EXISTS roles`);
    await db.none(`ALTER TABLE ${s}.clients DROP COLUMN IF EXISTS is_app_user`);

    await db.none(`ALTER TABLE ${s}.contacts DROP COLUMN IF EXISTS roles`);
    await db.none(`ALTER TABLE ${s}.contacts DROP COLUMN IF EXISTS is_app_user`);
    await db.none(`ALTER TABLE ${s}.contacts DROP COLUMN IF EXISTS is_active`);
  },
});
