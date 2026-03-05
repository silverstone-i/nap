/**
 * @file Add CHECK constraints on status columns for AR tables
 * @module ar/schema/migrations/202503050061_statusChecks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503050061-status-checks',
  description: 'Add CHECK constraints on status columns for AR tables',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    const addCheck = (table, name, expr) =>
      db.none(
        `DO $$ BEGIN ALTER TABLE ${s}.${table} ADD CONSTRAINT ${name} CHECK (${expr}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    await addCheck('ar_invoices', 'ar_invoices_status_check', "status IN ('open','sent','paid','voided')");
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.ar_invoices DROP CONSTRAINT IF EXISTS ar_invoices_status_check`);
  },
});
