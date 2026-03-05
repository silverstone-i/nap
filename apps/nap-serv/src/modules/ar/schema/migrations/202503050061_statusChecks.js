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
    await db.none(
      `ALTER TABLE ${s}.ar_invoices ADD CONSTRAINT ar_invoices_status_check CHECK (status IN ('open', 'sent', 'paid', 'voided'))`,
    );
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.ar_invoices DROP CONSTRAINT IF EXISTS ar_invoices_status_check`);
  },
});
