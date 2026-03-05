/**
 * @file Add CHECK constraints on status columns for accounting tables
 * @module accounting/schema/migrations/202503050071_statusChecks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

export default defineMigration({
  id: '202503050071-status-checks',
  description: 'Add CHECK constraints on status columns for accounting tables',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    const addCheck = (table, name, expr) =>
      db.none(
        `DO $$ BEGIN ALTER TABLE ${s}.${table} ADD CONSTRAINT ${name} CHECK (${expr}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
      );
    await addCheck('journal_entries', 'journal_entries_status_check', "status IN ('pending','posted','reversed')");
    await addCheck('posting_queues', 'posting_queues_status_check', "status IN ('pending','posted','failed')");
    await addCheck(
      'inter_company_transactions',
      'inter_company_transactions_status_check',
      "status IN ('pending','posted','reversed')",
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_status_check`);
    await db.none(`ALTER TABLE ${s}.posting_queues DROP CONSTRAINT IF EXISTS posting_queues_status_check`);
    await db.none(
      `ALTER TABLE ${s}.inter_company_transactions DROP CONSTRAINT IF EXISTS inter_company_transactions_status_check`,
    );
  },
});
