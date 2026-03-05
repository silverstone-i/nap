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
    await db.none(
      `ALTER TABLE ${s}.ap_invoices ADD CONSTRAINT ap_invoices_status_check CHECK (status IN ('open', 'approved', 'paid', 'voided'))`,
    );
    await db.none(
      `ALTER TABLE ${s}.ap_credit_memos ADD CONSTRAINT ap_credit_memos_status_check CHECK (status IN ('open', 'applied', 'voided'))`,
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.ap_invoices DROP CONSTRAINT IF EXISTS ap_invoices_status_check`);
    await db.none(`ALTER TABLE ${s}.ap_credit_memos DROP CONSTRAINT IF EXISTS ap_credit_memos_status_check`);
  },
});
