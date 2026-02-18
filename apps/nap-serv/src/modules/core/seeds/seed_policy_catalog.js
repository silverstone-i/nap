/**
 * @file Seeds the policy_catalog table with all valid module/router/action combinations
 * @module core/seeds/seed_policy_catalog
 *
 * The policy_catalog is a read-only registry that administrators query to discover
 * available permissions when configuring roles. Router names use URL path segments
 * as the canonical convention.
 *
 * sort_order uses 100-level gaps for modules, 10-level gaps for routers,
 * and 1-level gaps for actions.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../db/db.js';

/**
 * Safely insert a record, silently skipping unique constraint violations.
 */
async function safeInsert(schema, data) {
  try {
    return await db('policyCatalog', schema).insert(data);
  } catch (e) {
    if (e?.code === '23505') return null; // unique violation — already seeded
    throw e;
  }
}

/** @type {Array<{module: string, router: string|null, action: string|null, label: string, description: string|null, sort_order: number}>} */
const CATALOG = [
  // ── tenants ─────────────────────────────────────────────────────────
  { module: 'tenants', router: null, action: null, label: 'Tenants (all)', description: 'Full tenant management module access', sort_order: 100 },
  { module: 'tenants', router: 'tenants', action: null, label: 'Tenants', description: 'Create, view, and manage tenant organizations', sort_order: 110 },
  { module: 'tenants', router: 'nap-users', action: null, label: 'NAP Users', description: 'Create, view, and manage platform users', sort_order: 120 },

  // ── core ────────────────────────────────────────────────────────────
  { module: 'core', router: null, action: null, label: 'Core (all)', description: 'Full core entities module access', sort_order: 200 },
  { module: 'core', router: 'sources', action: null, label: 'Sources', description: 'View source records (read-only)', sort_order: 210 },
  { module: 'core', router: 'vendors', action: null, label: 'Vendors', description: 'Manage vendor records', sort_order: 220 },
  { module: 'core', router: 'clients', action: null, label: 'Clients', description: 'Manage client records', sort_order: 230 },
  { module: 'core', router: 'employees', action: null, label: 'Employees', description: 'Manage employee records', sort_order: 240 },
  { module: 'core', router: 'contacts', action: null, label: 'Contacts', description: 'Manage contact records', sort_order: 250 },
  { module: 'core', router: 'addresses', action: null, label: 'Addresses', description: 'Manage address records', sort_order: 260 },
  { module: 'core', router: 'inter-companies', action: null, label: 'Inter-Companies', description: 'Manage inter-company entities', sort_order: 270 },
  { module: 'core', router: 'roles', action: null, label: 'Roles', description: 'Manage tenant RBAC roles', sort_order: 280 },
  { module: 'core', router: 'role-members', action: null, label: 'Role Members', description: 'Manage role membership assignments', sort_order: 281 },
  { module: 'core', router: 'policies', action: null, label: 'Policies', description: 'Manage role permission policies', sort_order: 282 },
  { module: 'core', router: 'policy-catalog', action: null, label: 'Policy Catalog', description: 'View available permission combinations (read-only)', sort_order: 283 },

  // ── projects ────────────────────────────────────────────────────────
  { module: 'projects', router: null, action: null, label: 'Projects (all)', description: 'Full projects module access', sort_order: 300 },
  { module: 'projects', router: 'projects', action: null, label: 'Projects', description: 'Manage project records', sort_order: 310 },
  { module: 'projects', router: 'projects', action: 'release', label: 'Release Project', description: 'Transition project from budgeting to released', sort_order: 311 },
  { module: 'projects', router: 'units', action: null, label: 'Units', description: 'Manage project units', sort_order: 320 },
  { module: 'projects', router: 'tasks', action: null, label: 'Tasks', description: 'Manage project tasks', sort_order: 330 },
  { module: 'projects', router: 'task-groups', action: null, label: 'Task Groups', description: 'Manage task groups', sort_order: 340 },
  { module: 'projects', router: 'tasks-master', action: null, label: 'Tasks Master', description: 'Manage master task list', sort_order: 350 },
  { module: 'projects', router: 'cost-items', action: null, label: 'Cost Items', description: 'Manage project cost items', sort_order: 360 },
  { module: 'projects', router: 'change-orders', action: null, label: 'Change Orders', description: 'Manage project change orders', sort_order: 370 },
  { module: 'projects', router: 'change-orders', action: 'approve', label: 'Approve Change Order', description: 'Approve a submitted change order', sort_order: 371 },
  { module: 'projects', router: 'change-orders', action: 'reject', label: 'Reject Change Order', description: 'Reject a submitted change order', sort_order: 372 },
  { module: 'projects', router: 'template-units', action: null, label: 'Template Units', description: 'Manage project template units', sort_order: 380 },
  { module: 'projects', router: 'template-tasks', action: null, label: 'Template Tasks', description: 'Manage project template tasks', sort_order: 390 },
  { module: 'projects', router: 'template-cost-items', action: null, label: 'Template Cost Items', description: 'Manage project template cost items', sort_order: 395 },
  { module: 'projects', router: 'template-change-orders', action: null, label: 'Template Change Orders', description: 'Manage project template change orders', sort_order: 396 },

  // ── activities ──────────────────────────────────────────────────────
  { module: 'activities', router: null, action: null, label: 'Activities (all)', description: 'Full activities module access', sort_order: 400 },
  { module: 'activities', router: 'activities', action: null, label: 'Activities', description: 'Manage activity records', sort_order: 410 },
  { module: 'activities', router: 'budgets', action: null, label: 'Budgets', description: 'Manage activity budgets', sort_order: 420 },
  { module: 'activities', router: 'budgets', action: 'approve', label: 'Approve Budget', description: 'Approve a submitted budget', sort_order: 421 },
  { module: 'activities', router: 'budgets', action: 'reject', label: 'Reject Budget', description: 'Reject a submitted budget', sort_order: 422 },
  { module: 'activities', router: 'categories', action: null, label: 'Categories', description: 'Manage activity categories', sort_order: 430 },
  { module: 'activities', router: 'actual-costs', action: null, label: 'Actual Costs', description: 'Manage actual cost records', sort_order: 440 },
  { module: 'activities', router: 'actual-costs', action: 'approve', label: 'Approve Actual Cost', description: 'Approve an actual cost for GL posting', sort_order: 441 },
  { module: 'activities', router: 'actual-costs', action: 'reject', label: 'Reject Actual Cost', description: 'Reject an actual cost', sort_order: 442 },
  { module: 'activities', router: 'cost-lines', action: null, label: 'Cost Lines', description: 'Manage cost line items', sort_order: 450 },
  { module: 'activities', router: 'deliverables', action: null, label: 'Deliverables', description: 'Manage deliverable records', sort_order: 460 },
  { module: 'activities', router: 'deliverable-assignments', action: null, label: 'Deliverable Assignments', description: 'Manage deliverable-to-vendor assignments', sort_order: 470 },
  { module: 'activities', router: 'vendor-parts', action: null, label: 'Vendor Parts', description: 'Manage vendor part records', sort_order: 480 },

  // ── bom ─────────────────────────────────────────────────────────────
  { module: 'bom', router: null, action: null, label: 'BOM (all)', description: 'Full bill of materials module access', sort_order: 500 },
  { module: 'bom', router: 'catalog-skus', action: null, label: 'Catalog SKUs', description: 'Manage catalog SKU records', sort_order: 510 },
  { module: 'bom', router: 'vendor-skus', action: null, label: 'Vendor SKUs', description: 'Manage vendor SKU mappings', sort_order: 520 },
  { module: 'bom', router: 'vendor-pricing', action: null, label: 'Vendor Pricing', description: 'Manage vendor pricing records', sort_order: 530 },

  // ── ap ──────────────────────────────────────────────────────────────
  { module: 'ap', router: null, action: null, label: 'AP (all)', description: 'Full accounts payable module access', sort_order: 600 },
  { module: 'ap', router: 'ap-invoices', action: null, label: 'AP Invoices', description: 'Manage AP invoice records', sort_order: 610 },
  { module: 'ap', router: 'ap-invoices', action: 'approve', label: 'AP Invoice Approval', description: 'Approve vendor invoices for payment', sort_order: 611 },
  { module: 'ap', router: 'ap-invoices', action: 'void', label: 'Void AP Invoice', description: 'Void an AP invoice', sort_order: 612 },
  { module: 'ap', router: 'ap-invoice-lines', action: null, label: 'AP Invoice Lines', description: 'Manage AP invoice line items', sort_order: 620 },
  { module: 'ap', router: 'ap-credit-memos', action: null, label: 'AP Credit Memos', description: 'Manage AP credit memo records', sort_order: 630 },
  { module: 'ap', router: 'ap-credit-memos', action: 'void', label: 'Void AP Credit Memo', description: 'Void an AP credit memo', sort_order: 631 },
  { module: 'ap', router: 'payments', action: null, label: 'Payments', description: 'Manage payment records', sort_order: 640 },

  // ── ar ──────────────────────────────────────────────────────────────
  { module: 'ar', router: null, action: null, label: 'AR (all)', description: 'Full accounts receivable module access', sort_order: 700 },
  { module: 'ar', router: 'ar-invoices', action: null, label: 'AR Invoices', description: 'Manage AR invoice records', sort_order: 710 },
  { module: 'ar', router: 'ar-invoices', action: 'approve', label: 'AR Invoice Approval', description: 'Approve AR invoices for sending to clients', sort_order: 711 },
  { module: 'ar', router: 'ar-invoices', action: 'void', label: 'Void AR Invoice', description: 'Void an AR invoice', sort_order: 712 },
  { module: 'ar', router: 'ar-invoice-lines', action: null, label: 'AR Invoice Lines', description: 'Manage AR invoice line items', sort_order: 720 },
  { module: 'ar', router: 'clients', action: null, label: 'AR Clients', description: 'Manage AR client records', sort_order: 730 },
  { module: 'ar', router: 'receipts', action: null, label: 'Receipts', description: 'Manage receipt records', sort_order: 740 },

  // ── accounting ──────────────────────────────────────────────────────
  { module: 'accounting', router: null, action: null, label: 'Accounting (all)', description: 'Full general ledger module access', sort_order: 800 },
  { module: 'accounting', router: 'chart-of-accounts', action: null, label: 'Chart of Accounts', description: 'Manage chart of accounts', sort_order: 810 },
  { module: 'accounting', router: 'journal-entries', action: null, label: 'Journal Entries', description: 'Manage journal entries', sort_order: 820 },
  { module: 'accounting', router: 'journal-entries', action: 'post', label: 'Post Journal Entry', description: 'Post a journal entry to the general ledger', sort_order: 821 },
  { module: 'accounting', router: 'journal-entries', action: 'reverse', label: 'Reverse Journal Entry', description: 'Reverse a posted journal entry', sort_order: 822 },
  { module: 'accounting', router: 'journal-entry-lines', action: null, label: 'Journal Entry Lines', description: 'Manage journal entry line items', sort_order: 830 },
  { module: 'accounting', router: 'ledger-balances', action: null, label: 'Ledger Balances', description: 'View ledger balance summaries', sort_order: 840 },
  { module: 'accounting', router: 'posting-queues', action: null, label: 'Posting Queues', description: 'Manage posting queue records', sort_order: 850 },
  { module: 'accounting', router: 'categories-account-map', action: null, label: 'Categories Account Map', description: 'Manage category-to-account mappings', sort_order: 860 },
  { module: 'accounting', router: 'inter-company-accounts', action: null, label: 'Inter-Company Accounts', description: 'Manage inter-company GL accounts', sort_order: 870 },
  { module: 'accounting', router: 'inter-company-transactions', action: null, label: 'Inter-Company Transactions', description: 'Manage inter-company transactions', sort_order: 880 },
  { module: 'accounting', router: 'internal-transfers', action: null, label: 'Internal Transfers', description: 'Manage internal fund transfers', sort_order: 890 },

  // ── reports ─────────────────────────────────────────────────────────
  { module: 'reports', router: null, action: null, label: 'Reports (all)', description: 'Full reports module access', sort_order: 900 },
  { module: 'reports', router: 'reports', action: null, label: 'Reports', description: 'View and generate reports', sort_order: 910 },

  // ── views ───────────────────────────────────────────────────────────
  { module: 'views', router: null, action: null, label: 'Views (all)', description: 'Full views module access', sort_order: 1000 },
  { module: 'views', router: 'views', action: null, label: 'Views', description: 'Manage saved views', sort_order: 1010 },
];

/**
 * Seed the policy_catalog table with all valid module/router/action combinations.
 * Idempotent — skips entries that already exist via unique constraint on (module, router, action).
 *
 * @param {object} options
 * @param {string} options.schemaName Tenant schema name
 */
export async function seedPolicyCatalog({ schemaName }) {
  const schema = schemaName ? schemaName.toLowerCase() : 'public';
  if (schema === 'admin') return;

  // Check that policy_catalog table exists
  const tableExists = await db.oneOrNone(
    'SELECT to_regclass($1) AS exists',
    [`${schema}.policy_catalog`],
  );
  if (!tableExists?.exists) {
    console.warn(`Skipping policy_catalog seeding for schema "${schema}" — table missing.`);
    return;
  }

  console.log(`Seeding policy_catalog for schema: ${schema}`);
  for (const entry of CATALOG) {
    await safeInsert(schema, entry);
  }
}

export { CATALOG };
export default seedPolicyCatalog;
