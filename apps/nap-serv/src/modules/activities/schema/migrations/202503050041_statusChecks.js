/**
 * @file Add CHECK constraints on status columns for activity tables
 * @module activities/schema/migrations/202503050041_statusChecks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503050041-status-checks',
  description: 'Add CHECK constraints on status columns for activity tables',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(
      `ALTER TABLE ${s}.deliverables ADD CONSTRAINT deliverables_status_check CHECK (status IN ('pending', 'released', 'finished', 'canceled'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.budgets ADD CONSTRAINT budgets_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'locked', 'rejected'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.cost_lines ADD CONSTRAINT cost_lines_status_check CHECK (status IN ('draft', 'submitted', 'approved', 'change_order'))`,
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.deliverables DROP CONSTRAINT IF EXISTS deliverables_status_check`);
    await db.none(`ALTER TABLE ${s}.budgets DROP CONSTRAINT IF EXISTS budgets_status_check`);
    await db.none(`ALTER TABLE ${s}.cost_lines DROP CONSTRAINT IF EXISTS cost_lines_status_check`);
  },
});
