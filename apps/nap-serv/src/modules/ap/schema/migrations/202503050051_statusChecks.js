/**
 * @file Add CHECK constraints on status columns for AP tables
 * @module ap/schema/migrations/202503050051_statusChecks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503050051-status-checks',
  description: 'Add CHECK constraints on status columns for AP tables',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    const addCheck = (table, name, expr) =>
      db.none(
        `DO $$ BEGIN ALTER TABLE ${s}.${table} ADD CONSTRAINT ${name} CHECK (${expr}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    await addCheck('ap_invoices', 'ap_invoices_status_check', "status IN ('open','approved','paid','voided')");
    await addCheck('ap_credit_memos', 'ap_credit_memos_status_check', "status IN ('open','applied','voided')");
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.ap_invoices DROP CONSTRAINT IF EXISTS ap_invoices_status_check`);
    await db.none(`ALTER TABLE ${s}.ap_credit_memos DROP CONSTRAINT IF EXISTS ap_credit_memos_status_check`);
  },
});
