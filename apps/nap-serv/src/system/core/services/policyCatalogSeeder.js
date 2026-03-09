/**
 * @file Policy catalog seeder — populates policy_catalog with all valid
 *       (module, router, action) tuples for role-configuration UI discovery
 * @module core/services/policyCatalogSeeder
 *
 * Called during tenant provisioning (after systemRoleSeeder).
 * Idempotent — safe to re-run on existing tenants.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import logger from '../../../lib/logger.js';

// ─── Catalog entries ────────────────────────────────────────────────
// Two tiers:
//   1. Module-level (router=null, action=null) — one per module
//   2. Router-level (action=null)              — one per router
//
// sort_order convention: module = X00, routers = X10, X20, …
//
// available_fields: user-facing columns per resource (excludes id,
// tenant_id, tenant_code, source_id, audit fields, deactivated_at)
// ────────────────────────────────────────────────────────────────────

const CATALOG_ENTRIES = [
  // ── Core ────────────────────────────────────────────────────────
  { module: 'core', router: null, action: null, label: 'Admin Module', description: 'Entity management and RBAC configuration', sort_order: 100 },
  { module: 'core', router: null, action: 'reset-password', label: 'Reset Password', description: 'Reset any app-user password', sort_order: 101 },
  { module: 'core', router: 'vendors', action: null, label: 'Vendors', description: 'Vendor company records', sort_order: 110, available_fields: ['name', 'code', 'tax_id', 'payment_terms', 'is_active', 'roles', 'is_app_user', 'notes'] },
  { module: 'core', router: 'clients', action: null, label: 'Clients', description: 'Client company records', sort_order: 120, available_fields: ['name', 'code', 'email', 'tax_id', 'roles', 'is_app_user', 'is_active'] },
  { module: 'core', router: 'employees', action: null, label: 'Employees', description: 'Employee records', sort_order: 130, available_fields: ['first_name', 'last_name', 'code', 'position', 'department', 'email', 'is_app_user', 'roles', 'is_primary_contact', 'is_billing_contact'] },
  { module: 'core', router: 'contacts', action: null, label: 'Contacts', description: 'Miscellaneous contacts / payees', sort_order: 140, available_fields: ['name', 'code', 'email', 'tax_id', 'roles', 'is_app_user', 'is_active'] },
  { module: 'core', router: 'sources', action: null, label: 'Sources', description: 'Polymorphic source registry', sort_order: 150, policy_required: false, available_fields: ['table_id', 'source_type', 'label'] },
  { module: 'core', router: 'addresses', action: null, label: 'Addresses', description: 'Addresses linked to entities', sort_order: 160, policy_required: false, available_fields: ['label', 'address_line_1', 'address_line_2', 'address_line_3', 'city', 'state_province', 'postal_code', 'country_code', 'is_primary'] },
  { module: 'core', router: 'phone-numbers', action: null, label: 'Phone Numbers', description: 'Phone numbers linked to entities', sort_order: 170, policy_required: false, available_fields: ['phone_type', 'phone_number', 'is_primary'] },
  { module: 'core', router: 'inter-companies', action: null, label: 'Inter-Companies', description: 'Internal company entities for intercompany accounting', sort_order: 180, available_fields: ['code', 'name', 'tax_id', 'is_active'] },
  { module: 'core', router: 'roles', action: null, label: 'Roles', description: 'RBAC role definitions', sort_order: 190, available_fields: ['code', 'name', 'description', 'is_system', 'is_immutable', 'scope'] },
  { module: 'core', router: 'policies', action: null, label: 'Policies', description: 'Permission grants per role', sort_order: 200, policy_required: false, available_fields: ['role_id', 'module', 'router', 'action', 'level'] },
  { module: 'core', router: 'policy-catalog', action: null, label: 'Policy Catalog', description: 'Read-only permission discovery catalog', sort_order: 210, policy_required: false },
  { module: 'core', router: 'state-filters', action: null, label: 'State Filters', description: 'Layer 3 status visibility filters', sort_order: 220, available_fields: ['role_id', 'module', 'router', 'visible_statuses'] },
  { module: 'core', router: 'field-group-definitions', action: null, label: 'Field Group Definitions', description: 'Layer 4 named column groups', sort_order: 230, available_fields: ['module', 'router', 'group_name', 'columns', 'is_default'] },
  { module: 'core', router: 'field-group-grants', action: null, label: 'Field Group Grants', description: 'Layer 4 field group assignments to roles', sort_order: 240, available_fields: ['role_id', 'field_group_id'] },
  { module: 'core', router: 'project-members', action: null, label: 'Project Members', description: 'Layer 2 user-to-project assignments', sort_order: 250, available_fields: ['project_id', 'user_id', 'role'] },
  { module: 'core', router: 'company-members', action: null, label: 'Company Members', description: 'Layer 2 user-to-company assignments', sort_order: 260, available_fields: ['company_id', 'user_id'] },
  { module: 'core', router: 'numbering-config', action: null, label: 'Numbering Config', description: 'Auto-numbering format configuration per entity type', sort_order: 270 },

  // ── Projects ────────────────────────────────────────────────────
  { module: 'projects', router: null, action: null, label: 'Projects Module', description: 'Project structure, tasks, cost items, and templates', sort_order: 300 },
  { module: 'projects', router: 'projects', action: null, label: 'Projects', description: 'Project header records', sort_order: 310, valid_statuses: ['planning', 'budgeting', 'released', 'on_hold', 'complete'], available_fields: ['company_id', 'address_id', 'project_code', 'name', 'description', 'notes', 'status', 'contract_amount'] },
  { module: 'projects', router: 'project-clients', action: null, label: 'Project Clients', description: 'Client assignments per project', sort_order: 320, policy_required: false, available_fields: ['project_id', 'client_id', 'role', 'is_primary'] },
  { module: 'projects', router: 'units', action: null, label: 'Units', description: 'Project units / phases', sort_order: 330, valid_statuses: ['draft', 'released', 'complete'], available_fields: ['project_id', 'template_unit_id', 'version_used', 'name', 'unit_code', 'status'] },
  { module: 'projects', router: 'task-groups', action: null, label: 'Task Groups', description: 'Task grouping containers', sort_order: 340, available_fields: ['code', 'name', 'description', 'sort_order'] },
  { module: 'projects', router: 'tasks-master', action: null, label: 'Tasks Master', description: 'Master task definitions', sort_order: 350, available_fields: ['code', 'task_group_code', 'name', 'default_duration_days'] },
  { module: 'projects', router: 'tasks', action: null, label: 'Tasks', description: 'Project tasks', sort_order: 360, valid_statuses: ['pending', 'in_progress', 'complete', 'on_hold'], available_fields: ['unit_id', 'task_code', 'name', 'duration_days', 'status', 'parent_task_id'] },
  { module: 'projects', router: 'cost-items', action: null, label: 'Cost Items', description: 'Budget line items per task', sort_order: 370, policy_required: false, available_fields: ['task_id', 'item_code', 'description', 'cost_class', 'cost_source', 'quantity', 'unit_cost'] },
  { module: 'projects', router: 'change-orders', action: null, label: 'Change Orders', description: 'Scope and cost change orders', sort_order: 380, valid_statuses: ['draft', 'submitted', 'approved', 'rejected'], available_fields: ['unit_id', 'co_number', 'title', 'reason', 'status', 'total_amount'] },
  { module: 'projects', router: 'template-units', action: null, label: 'Template Units', description: 'Reusable unit blueprints', sort_order: 390, valid_statuses: ['draft', 'active'], available_fields: ['name', 'version', 'status'] },
  { module: 'projects', router: 'template-tasks', action: null, label: 'Template Tasks', description: 'Reusable task blueprints', sort_order: 400, policy_required: false, available_fields: ['template_unit_id', 'task_code', 'name', 'duration_days', 'parent_code'] },
  { module: 'projects', router: 'template-cost-items', action: null, label: 'Template Cost Items', description: 'Reusable cost item blueprints', sort_order: 410, policy_required: false, available_fields: ['template_task_id', 'item_code', 'description', 'cost_class', 'cost_source', 'quantity', 'unit_cost'] },
  { module: 'projects', router: 'template-change-orders', action: null, label: 'Template Change Orders', description: 'Reusable change order blueprints', sort_order: 420, policy_required: false, available_fields: ['template_unit_id', 'co_number', 'title', 'reason', 'total_amount'] },

  // ── Activities ──────────────────────────────────────────────────
  { module: 'activities', router: null, action: null, label: 'Activities Module', description: 'Categories, deliverables, budgets, and cost tracking', sort_order: 500 },
  { module: 'activities', router: 'categories', action: null, label: 'Categories', description: 'Activity cost categories', sort_order: 510, available_fields: ['code', 'name', 'type'] },
  { module: 'activities', router: 'activities', action: null, label: 'Activities', description: 'Activity records', sort_order: 520, available_fields: ['category_id', 'code', 'name', 'is_active'] },
  { module: 'activities', router: 'deliverables', action: null, label: 'Deliverables', description: 'Project deliverables', sort_order: 530, valid_statuses: ['pending', 'released', 'finished', 'canceled'], available_fields: ['name', 'description', 'status', 'start_date', 'end_date'] },
  { module: 'activities', router: 'deliverable-assignments', action: null, label: 'Deliverable Assignments', description: 'Employee assignments to deliverables', sort_order: 540, policy_required: false, available_fields: ['deliverable_id', 'project_id', 'employee_id', 'notes'] },
  { module: 'activities', router: 'budgets', action: null, label: 'Budgets', description: 'Deliverable-activity budget allocations', sort_order: 550, valid_statuses: ['draft', 'submitted', 'approved', 'locked', 'rejected'], available_fields: ['deliverable_id', 'activity_id', 'budgeted_amount', 'version', 'is_current', 'status', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at'] },
  { module: 'activities', router: 'cost-lines', action: null, label: 'Cost Lines', description: 'Individual cost entries per deliverable', sort_order: 560, valid_statuses: ['draft', 'submitted', 'approved', 'change_order'], available_fields: ['company_id', 'deliverable_id', 'vendor_id', 'activity_id', 'budget_id', 'tenant_sku', 'source_type', 'quantity', 'unit_price', 'markup_pct', 'status'] },
  { module: 'activities', router: 'actual-costs', action: null, label: 'Actual Costs', description: 'Confirmed expenditures', sort_order: 570, valid_statuses: ['pending', 'approved', 'rejected'], available_fields: ['activity_id', 'project_id', 'amount', 'currency', 'reference', 'approval_status', 'incurred_on'] },
  { module: 'activities', router: 'vendor-parts', action: null, label: 'Vendor Parts', description: 'Vendor SKU links to cost lines', sort_order: 580, available_fields: ['vendor_id', 'vendor_sku', 'tenant_sku', 'unit_cost', 'currency', 'markup_pct', 'is_active'] },

  // ── BOM ─────────────────────────────────────────────────────────
  { module: 'bom', router: null, action: null, label: 'BOM Module', description: 'Bill of Materials — SKU catalog and vendor pricing', sort_order: 600 },
  { module: 'bom', router: 'catalog-skus', action: null, label: 'Catalog SKUs', description: 'Internal product catalog', sort_order: 610, available_fields: ['catalog_sku', 'description', 'description_normalized', 'category', 'sub_category', 'model'] },
  { module: 'bom', router: 'vendor-skus', action: null, label: 'Vendor SKUs', description: 'Vendor-submitted SKU descriptions with embeddings', sort_order: 620, available_fields: ['vendor_id', 'vendor_sku', 'description', 'description_normalized', 'catalog_sku_id', 'confidence', 'model'] },
  { module: 'bom', router: 'vendor-pricing', action: null, label: 'Vendor Pricing', description: 'Price history per vendor SKU', sort_order: 630, policy_required: false, available_fields: ['vendor_sku_id', 'unit_price', 'unit', 'effective_date'] },

  // ── AP ──────────────────────────────────────────────────────────
  { module: 'ap', router: null, action: null, label: 'AP Module', description: 'Accounts payable — vendor invoices and payments', sort_order: 700 },
  { module: 'ap', router: 'ap-invoices', action: null, label: 'AP Invoices', description: 'Vendor invoices', sort_order: 710, valid_statuses: ['open', 'approved', 'paid', 'voided'], available_fields: ['company_id', 'vendor_id', 'project_id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'currency', 'status', 'notes'] },
  { module: 'ap', router: 'ap-invoice-lines', action: null, label: 'AP Invoice Lines', description: 'Line items on vendor invoices', sort_order: 720, policy_required: false, available_fields: ['invoice_id', 'description', 'amount', 'account_id', 'cost_line_id', 'activity_id'] },
  { module: 'ap', router: 'payments', action: null, label: 'Payments', description: 'Vendor payments', sort_order: 730, available_fields: ['vendor_id', 'ap_invoice_id', 'payment_date', 'amount', 'method', 'reference', 'notes'] },
  { module: 'ap', router: 'ap-credit-memos', action: null, label: 'AP Credit Memos', description: 'Vendor credit memos', sort_order: 740, valid_statuses: ['open', 'applied', 'voided'], available_fields: ['vendor_id', 'ap_invoice_id', 'credit_number', 'credit_date', 'amount', 'reason', 'status'] },

  // ── AR ──────────────────────────────────────────────────────────
  { module: 'ar', router: null, action: null, label: 'AR Module', description: 'Accounts receivable — client invoices and receipts', sort_order: 800 },
  { module: 'ar', router: 'ar-invoices', action: null, label: 'AR Invoices', description: 'Client invoices', sort_order: 810, valid_statuses: ['open', 'sent', 'paid', 'voided'], available_fields: ['company_id', 'client_id', 'project_id', 'deliverable_id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'currency', 'status', 'notes'] },
  { module: 'ar', router: 'ar-invoice-lines', action: null, label: 'AR Invoice Lines', description: 'Line items on client invoices', sort_order: 820, policy_required: false, available_fields: ['invoice_id', 'description', 'amount', 'account_id'] },
  { module: 'ar', router: 'receipts', action: null, label: 'Receipts', description: 'Client payment receipts', sort_order: 830, available_fields: ['client_id', 'ar_invoice_id', 'receipt_date', 'amount', 'method', 'reference', 'notes'] },

  // ── Accounting ──────────────────────────────────────────────────
  { module: 'accounting', router: null, action: null, label: 'Accounting Module', description: 'General ledger, journal entries, and intercompany accounting', sort_order: 900 },
  { module: 'accounting', router: 'chart-of-accounts', action: null, label: 'Chart of Accounts', description: 'GL account definitions', sort_order: 910, available_fields: ['code', 'name', 'type', 'is_active', 'cash_basis', 'bank_account_number', 'routing_number', 'bank_name'] },
  { module: 'accounting', router: 'journal-entries', action: null, label: 'Journal Entries', description: 'Double-entry journal headers', sort_order: 920, valid_statuses: ['pending', 'posted', 'reversed'], available_fields: ['company_id', 'project_id', 'entry_date', 'description', 'status', 'source_type', 'corrects_id'] },
  { module: 'accounting', router: 'journal-entry-lines', action: null, label: 'Journal Entry Lines', description: 'Debit/credit lines per journal entry', sort_order: 930, policy_required: false, available_fields: ['entry_id', 'account_id', 'debit', 'credit', 'memo', 'related_table', 'related_id'] },
  { module: 'accounting', router: 'ledger-balances', action: null, label: 'Ledger Balances', description: 'Period-end account balances', sort_order: 940, available_fields: ['account_id', 'as_of_date', 'balance'] },
  { module: 'accounting', router: 'posting-queues', action: null, label: 'Posting Queues', description: 'Async journal entry posting queue', sort_order: 950, valid_statuses: ['pending', 'posted', 'failed'], available_fields: ['journal_entry_id', 'status', 'error_message', 'processed_at'] },
  { module: 'accounting', router: 'category-account-map', action: null, label: 'Category Account Map', description: 'Maps cost categories to GL accounts', sort_order: 960, available_fields: ['category_id', 'account_id', 'valid_from', 'valid_to'] },
  { module: 'accounting', router: 'inter-company-accounts', action: null, label: 'Inter-Company Accounts', description: 'Due-to / due-from account pairs', sort_order: 970, available_fields: ['source_company_id', 'target_company_id', 'inter_company_account_id', 'is_active'] },
  { module: 'accounting', router: 'inter-company-transactions', action: null, label: 'Inter-Company Transactions', description: 'Intercompany transaction records', sort_order: 980, valid_statuses: ['pending', 'posted', 'reversed'], available_fields: ['source_company_id', 'target_company_id', 'source_journal_entry_id', 'target_journal_entry_id', 'module', 'amount', 'status', 'is_eliminated', 'description'] },
  { module: 'accounting', router: 'internal-transfers', action: null, label: 'Internal Transfers', description: 'Cash transfers between company accounts', sort_order: 990, available_fields: ['from_account_id', 'to_account_id', 'transfer_date', 'amount', 'description'] },

  // ── Reports ─────────────────────────────────────────────────────
  { module: 'reports', router: null, action: null, label: 'Reports Module', description: 'Profitability, cashflow, and aging reports', sort_order: 1000 },
  { module: 'reports', router: 'project-profitability', action: null, label: 'Project Profitability', description: 'Revenue vs cost metrics per project', sort_order: 1010 },
  { module: 'reports', router: 'project-cashflow', action: null, label: 'Project Cashflow', description: 'Monthly inflow/outflow time series', sort_order: 1020 },
  { module: 'reports', router: 'project-cost-breakdown', action: null, label: 'Project Cost Breakdown', description: 'Cost by category with budget vs actual', sort_order: 1030 },
  { module: 'reports', router: 'ar-aging', action: null, label: 'AR Aging', description: 'Receivables aging by client', sort_order: 1040 },
  { module: 'reports', router: 'ap-aging', action: null, label: 'AP Aging', description: 'Payables aging by vendor', sort_order: 1050 },
  { module: 'reports', router: 'company-cashflow', action: null, label: 'Company Cashflow', description: 'Aggregated cashflow across all projects', sort_order: 1060 },
  { module: 'reports', router: 'margin-analysis', action: null, label: 'Margin Analysis', description: 'Cross-project margin comparison and trending', sort_order: 1070 },

  // ── Tenants (NapSoft admin scope) ───────────────────────────────
  { module: 'tenants', router: null, action: null, label: 'Tenants Module', description: 'Multi-tenant administration (NapSoft only)', sort_order: 1100 },
  { module: 'tenants', router: 'tenants', action: null, label: 'Tenants', description: 'Tenant CRUD and provisioning', sort_order: 1110 },
  { module: 'tenants', router: 'nap-users', action: null, label: 'NAP Users', description: 'Application user accounts', sort_order: 1120 },
  { module: 'tenants', router: 'admin', action: null, label: 'Admin Operations', description: 'Schema listing, impersonation', sort_order: 1130 },
  { module: 'tenants', router: 'match-review-logs', action: null, label: 'Match Review Logs', description: 'BOM vendor SKU matching audit trail', sort_order: 1140 },
];

/**
 * Seed the policy_catalog table with all valid (module, router, action) tuples.
 * Idempotent — skips rows that already exist.
 *
 * @param {object} dbInstance pg-promise database connection or transaction
 * @param {object} pgp pg-promise helpers
 * @param {string} schemaName Tenant schema name
 * @param {boolean} [isNapsoft=false] Whether this is the NapSoft platform tenant
 */
export async function seedPolicyCatalog(dbInstance, pgp, schemaName, isNapsoft = false) {
  const s = pgp.as.name(schemaName);
  let inserted = 0;

  const entries = isNapsoft ? CATALOG_ENTRIES : CATALOG_ENTRIES.filter((e) => e.module !== 'tenants');

  for (const entry of entries) {
    const existing = await dbInstance.oneOrNone(
      `SELECT id FROM ${s}.policy_catalog
       WHERE module = $1 AND router IS NOT DISTINCT FROM $2 AND action IS NOT DISTINCT FROM $3`,
      [entry.module, entry.router, entry.action],
    );

    if (!existing) {
      await dbInstance.none(
        `INSERT INTO ${s}.policy_catalog (module, router, action, label, description, sort_order, valid_statuses, available_fields, policy_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [entry.module, entry.router, entry.action, entry.label, entry.description, entry.sort_order, entry.valid_statuses || null, entry.available_fields || null, entry.policy_required ?? true],
      );
      inserted++;
    }
  }

  logger.info(`Policy catalog seeded in ${schemaName}: ${inserted} new entries (${entries.length} total)`);
}

export default { seedPolicyCatalog };
