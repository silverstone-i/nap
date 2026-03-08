/**
 * @file Add valid_statuses and available_fields columns to policy_catalog and backfill
 * @module core/schema/migrations/202503050013_policyCatalogValidStatuses
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

const BACKFILL = [
  { module: 'projects', router: 'projects', statuses: ['planning', 'budgeting', 'released', 'on_hold', 'complete'] },
  { module: 'projects', router: 'units', statuses: ['draft', 'released', 'complete'] },
  { module: 'projects', router: 'tasks', statuses: ['pending', 'in_progress', 'complete', 'on_hold'] },
  { module: 'projects', router: 'change-orders', statuses: ['draft', 'submitted', 'approved', 'rejected'] },
  { module: 'projects', router: 'template-units', statuses: ['draft', 'active'] },
  { module: 'activities', router: 'deliverables', statuses: ['pending', 'released', 'finished', 'canceled'] },
  { module: 'activities', router: 'budgets', statuses: ['draft', 'submitted', 'approved', 'locked', 'rejected'] },
  { module: 'activities', router: 'cost-lines', statuses: ['draft', 'submitted', 'approved', 'change_order'] },
  { module: 'activities', router: 'actual-costs', statuses: ['pending', 'approved', 'rejected'] },
  { module: 'ap', router: 'ap-invoices', statuses: ['open', 'approved', 'paid', 'voided'] },
  { module: 'ap', router: 'ap-credit-memos', statuses: ['open', 'applied', 'voided'] },
  { module: 'ar', router: 'ar-invoices', statuses: ['open', 'sent', 'paid', 'voided'] },
  { module: 'accounting', router: 'journal-entries', statuses: ['pending', 'posted', 'reversed'] },
  { module: 'accounting', router: 'posting-queues', statuses: ['pending', 'posted', 'failed'] },
  { module: 'accounting', router: 'inter-company-transactions', statuses: ['pending', 'posted', 'reversed'] },
];

export default defineMigration({
  id: '202503050013-policy-catalog-valid-statuses',
  description: 'Add valid_statuses and available_fields text[] columns to policy_catalog and backfill',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.policy_catalog ADD COLUMN IF NOT EXISTS valid_statuses text[]`);
    await db.none(`ALTER TABLE ${s}.policy_catalog ADD COLUMN IF NOT EXISTS available_fields text[]`);
    for (const { module, router, statuses } of BACKFILL) {
      await db.none(
        `UPDATE ${s}.policy_catalog SET valid_statuses = $3 WHERE module = $1 AND router = $2 AND action IS NULL`,
        [module, router, statuses],
      );
    }
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.policy_catalog DROP COLUMN IF EXISTS valid_statuses`);
    await db.none(`ALTER TABLE ${s}.policy_catalog DROP COLUMN IF EXISTS available_fields`);
  },
});
