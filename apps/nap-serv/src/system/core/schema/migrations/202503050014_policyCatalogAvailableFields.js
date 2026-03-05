/**
 * @file Add available_fields column to policy_catalog and backfill existing rows
 * @module core/schema/migrations/202503050014_policyCatalogAvailableFields
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../db/migrations/defineMigration.js';

const BACKFILL = [
  // ── Core ──────────────────────────────────────────────────────
  { module: 'core', router: 'vendors', fields: ['name', 'code', 'tax_id', 'payment_terms', 'is_active', 'roles', 'is_app_user', 'notes'] },
  { module: 'core', router: 'clients', fields: ['name', 'code', 'email', 'tax_id', 'roles', 'is_app_user', 'is_active'] },
  {
    module: 'core',
    router: 'employees',
    fields: [
      'first_name', 'last_name', 'code', 'position', 'department', 'email', 'is_app_user', 'roles', 'is_primary_contact',
      'is_billing_contact',
    ],
  },
  { module: 'core', router: 'contacts', fields: ['name', 'code', 'email', 'tax_id', 'roles', 'is_app_user', 'is_active'] },
  { module: 'core', router: 'sources', fields: ['table_id', 'source_type', 'label'] },
  {
    module: 'core',
    router: 'addresses',
    fields: ['label', 'address_line_1', 'address_line_2', 'address_line_3', 'city', 'state_province', 'postal_code', 'country_code', 'is_primary'],
  },
  { module: 'core', router: 'phone-numbers', fields: ['phone_type', 'phone_number', 'is_primary'] },
  { module: 'core', router: 'inter-companies', fields: ['code', 'name', 'tax_id', 'is_active'] },
  { module: 'core', router: 'roles', fields: ['code', 'name', 'description', 'is_system', 'is_immutable', 'scope'] },
  { module: 'core', router: 'policies', fields: ['role_id', 'module', 'router', 'action', 'level'] },
  { module: 'core', router: 'state-filters', fields: ['role_id', 'module', 'router', 'visible_statuses'] },
  { module: 'core', router: 'field-group-definitions', fields: ['module', 'router', 'group_name', 'columns', 'is_default'] },
  { module: 'core', router: 'field-group-grants', fields: ['role_id', 'field_group_id'] },
  { module: 'core', router: 'project-members', fields: ['project_id', 'user_id', 'role'] },
  { module: 'core', router: 'company-members', fields: ['company_id', 'user_id'] },

  // ── Projects ──────────────────────────────────────────────────
  { module: 'projects', router: 'projects', fields: ['company_id', 'address_id', 'project_code', 'name', 'description', 'notes', 'status', 'contract_amount'] },
  { module: 'projects', router: 'project-clients', fields: ['project_id', 'client_id', 'role', 'is_primary'] },
  { module: 'projects', router: 'units', fields: ['project_id', 'template_unit_id', 'version_used', 'name', 'unit_code', 'status'] },
  { module: 'projects', router: 'task-groups', fields: ['code', 'name', 'description', 'sort_order'] },
  { module: 'projects', router: 'tasks-master', fields: ['code', 'task_group_code', 'name', 'default_duration_days'] },
  { module: 'projects', router: 'tasks', fields: ['unit_id', 'task_code', 'name', 'duration_days', 'status', 'parent_task_id'] },
  { module: 'projects', router: 'cost-items', fields: ['task_id', 'item_code', 'description', 'cost_class', 'cost_source', 'quantity', 'unit_cost'] },
  { module: 'projects', router: 'change-orders', fields: ['unit_id', 'co_number', 'title', 'reason', 'status', 'total_amount'] },
  { module: 'projects', router: 'template-units', fields: ['name', 'version', 'status'] },
  { module: 'projects', router: 'template-tasks', fields: ['template_unit_id', 'task_code', 'name', 'duration_days', 'parent_code'] },
  { module: 'projects', router: 'template-cost-items', fields: ['template_task_id', 'item_code', 'description', 'cost_class', 'cost_source', 'quantity', 'unit_cost'] },
  { module: 'projects', router: 'template-change-orders', fields: ['template_unit_id', 'co_number', 'title', 'reason', 'total_amount'] },

  // ── Activities ────────────────────────────────────────────────
  { module: 'activities', router: 'categories', fields: ['code', 'name', 'type'] },
  { module: 'activities', router: 'activities', fields: ['category_id', 'code', 'name', 'is_active'] },
  { module: 'activities', router: 'deliverables', fields: ['name', 'description', 'status', 'start_date', 'end_date'] },
  { module: 'activities', router: 'deliverable-assignments', fields: ['deliverable_id', 'project_id', 'employee_id', 'notes'] },
  {
    module: 'activities',
    router: 'budgets',
    fields: ['deliverable_id', 'activity_id', 'budgeted_amount', 'version', 'is_current', 'status', 'submitted_by', 'submitted_at', 'approved_by', 'approved_at'],
  },
  {
    module: 'activities',
    router: 'cost-lines',
    fields: ['company_id', 'deliverable_id', 'vendor_id', 'activity_id', 'budget_id', 'tenant_sku', 'source_type', 'quantity', 'unit_price', 'markup_pct', 'status'],
  },
  { module: 'activities', router: 'actual-costs', fields: ['activity_id', 'project_id', 'amount', 'currency', 'reference', 'approval_status', 'incurred_on'] },
  { module: 'activities', router: 'vendor-parts', fields: ['vendor_id', 'vendor_sku', 'tenant_sku', 'unit_cost', 'currency', 'markup_pct', 'is_active'] },

  // ── BOM ───────────────────────────────────────────────────────
  { module: 'bom', router: 'catalog-skus', fields: ['catalog_sku', 'description', 'description_normalized', 'category', 'sub_category', 'model'] },
  { module: 'bom', router: 'vendor-skus', fields: ['vendor_id', 'vendor_sku', 'description', 'description_normalized', 'catalog_sku_id', 'confidence', 'model'] },
  { module: 'bom', router: 'vendor-pricing', fields: ['vendor_sku_id', 'unit_price', 'unit', 'effective_date'] },

  // ── AP ────────────────────────────────────────────────────────
  {
    module: 'ap',
    router: 'ap-invoices',
    fields: ['company_id', 'vendor_id', 'project_id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'currency', 'status', 'notes'],
  },
  { module: 'ap', router: 'ap-invoice-lines', fields: ['invoice_id', 'description', 'amount', 'account_id', 'cost_line_id', 'activity_id'] },
  { module: 'ap', router: 'payments', fields: ['vendor_id', 'ap_invoice_id', 'payment_date', 'amount', 'method', 'reference', 'notes'] },
  { module: 'ap', router: 'ap-credit-memos', fields: ['vendor_id', 'ap_invoice_id', 'credit_number', 'credit_date', 'amount', 'reason', 'status'] },

  // ── AR ────────────────────────────────────────────────────────
  {
    module: 'ar',
    router: 'ar-invoices',
    fields: ['company_id', 'client_id', 'project_id', 'deliverable_id', 'invoice_number', 'invoice_date', 'due_date', 'total_amount', 'currency', 'status', 'notes'],
  },
  { module: 'ar', router: 'ar-invoice-lines', fields: ['invoice_id', 'description', 'amount', 'account_id'] },
  { module: 'ar', router: 'receipts', fields: ['client_id', 'ar_invoice_id', 'receipt_date', 'amount', 'method', 'reference', 'notes'] },

  // ── Accounting ────────────────────────────────────────────────
  { module: 'accounting', router: 'chart-of-accounts', fields: ['code', 'name', 'type', 'is_active', 'cash_basis', 'bank_account_number', 'routing_number', 'bank_name'] },
  { module: 'accounting', router: 'journal-entries', fields: ['company_id', 'project_id', 'entry_date', 'description', 'status', 'source_type', 'corrects_id'] },
  { module: 'accounting', router: 'journal-entry-lines', fields: ['entry_id', 'account_id', 'debit', 'credit', 'memo', 'related_table', 'related_id'] },
  { module: 'accounting', router: 'ledger-balances', fields: ['account_id', 'as_of_date', 'balance'] },
  { module: 'accounting', router: 'posting-queues', fields: ['journal_entry_id', 'status', 'error_message', 'processed_at'] },
  { module: 'accounting', router: 'category-account-map', fields: ['category_id', 'account_id', 'valid_from', 'valid_to'] },
  {
    module: 'accounting',
    router: 'inter-company-accounts',
    fields: ['source_company_id', 'target_company_id', 'inter_company_account_id', 'is_active'],
  },
  {
    module: 'accounting',
    router: 'inter-company-transactions',
    fields: ['source_company_id', 'target_company_id', 'source_journal_entry_id', 'target_journal_entry_id', 'module', 'amount', 'status', 'is_eliminated', 'description'],
  },
  { module: 'accounting', router: 'internal-transfers', fields: ['from_account_id', 'to_account_id', 'transfer_date', 'amount', 'description'] },
];

export default defineMigration({
  id: '202503050014-policy-catalog-available-fields',
  description: 'Add available_fields text[] column to policy_catalog and backfill',
  async up({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.policy_catalog ADD COLUMN IF NOT EXISTS available_fields text[]`);
    for (const { module, router, fields } of BACKFILL) {
      await db.none(
        `UPDATE ${s}.policy_catalog SET available_fields = $3 WHERE module = $1 AND router = $2 AND action IS NULL`,
        [module, router, fields],
      );
    }
  },
  async down({ schema, db, pgp }) {
    if (schema === 'admin') return;
    const s = pgp.as.name(schema);
    await db.none(`ALTER TABLE ${s}.policy_catalog DROP COLUMN IF EXISTS available_fields`);
  },
});
