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
    const addCheck = (table, name, expr) =>
      db.none(
        `DO $$ BEGIN ALTER TABLE ${s}.${table} ADD CONSTRAINT ${name} CHECK (${expr}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    await addCheck('projects', 'projects_status_check', "status IN ('planning','budgeting','released','on_hold','complete')");
    await addCheck('units', 'units_status_check', "status IN ('draft','released','complete')");
    await addCheck('tasks', 'tasks_status_check', "status IN ('pending','in_progress','complete','on_hold')");
    await addCheck('change_orders', 'change_orders_status_check', "status IN ('draft','submitted','approved','rejected')");
    await addCheck('template_units', 'template_units_status_check', "status IN ('draft','active')");
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
