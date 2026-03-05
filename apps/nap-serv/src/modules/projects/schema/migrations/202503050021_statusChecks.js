/**
 * @file Add CHECK constraints on status columns for project tables
 * @module projects/schema/migrations/202503050021_statusChecks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503050021-status-checks',
  description: 'Add CHECK constraints on status columns for project tables',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(
      `ALTER TABLE ${s}.projects ADD CONSTRAINT projects_status_check CHECK (status IN ('planning', 'budgeting', 'released', 'on_hold', 'complete'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.units ADD CONSTRAINT units_status_check CHECK (status IN ('draft', 'released', 'complete'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.tasks ADD CONSTRAINT tasks_status_check CHECK (status IN ('pending', 'in_progress', 'complete', 'on_hold'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.change_orders ADD CONSTRAINT change_orders_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'rejected'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.template_units ADD CONSTRAINT template_units_status_check CHECK (status IN ('draft', 'active'))`,
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.projects DROP CONSTRAINT IF EXISTS projects_status_check`);
    await db.none(`ALTER TABLE ${s}.units DROP CONSTRAINT IF EXISTS units_status_check`);
    await db.none(`ALTER TABLE ${s}.tasks DROP CONSTRAINT IF EXISTS tasks_status_check`);
    await db.none(`ALTER TABLE ${s}.change_orders DROP CONSTRAINT IF EXISTS change_orders_status_check`);
    await db.none(`ALTER TABLE ${s}.template_units DROP CONSTRAINT IF EXISTS template_units_status_check`);
  },
});
