# Phase 5 Roadmap: Business Logic for Accounting, AR, and AP

This document outlines the tasks required to implement business logic for the General Ledger (Accounting), Accounts Payable (AP), and Accounts Receivable (AR) modules. These layers will integrate with the existing activity costing engine and enable transactional integrity and auditability across the system.

---

## 🛠️ Activities Module Logic

This section outlines the business logic required to move the activities module from raw data capture to actionable financial integration.

- [ ] Enforce project budget status: actual costs only allowed after budget approval
- [ ] Auto-calculate `remaining_budget` and `spent_to_date` fields on cost line insert/update
- [ ] Validate cost lines against their corresponding project_unit_budget limits
- [ ] Track actual cost totals per:
  - Activity
  - Unit budget
  - Project
- [ ] Add support for `change_order_lines`:
  - Must reference original cost line
  - Must have approval status before posting
  - Adjust remaining budget and variance metrics
- [ ] Enforce data entry window rules:
  - Costs only permitted within project schedule
  - Exception logic for late-entry or overruns
- [ ] Track cost origin (manual, AP, change order)
- [ ] Link posted costs to GL journal entries (via shared logic)
- [ ] Implement budget vs actual reporting views at:
  - Project level
  - Unit budget level
  - Activity level

---

## 🧾 Accounting (General Ledger)

- [ ] Auto-generate journal entries from:
  - Cost lines
  - Change order lines
  - AP invoice approvals
  - AR invoice creation
  - Intercompany transactions
- [ ] Determine appropriate journal type per document source
- [ ] Enforce balanced debits and credits
- [ ] Validate journal dates fall within open fiscal periods
- [ ] Prevent posting to locked fiscal periods
- [ ] Link journal entries to source documents (e.g. cost_line_id, invoice_id)
- [ ] Maintain a full audit trail including user and tenant information
- [ ] Configure account mapping logic:
  - Activity → Category → GL Account (with fallback support)
- [ ] Implement auto-post triggers:
  - actual_costs, change_order_lines, ap_invoices, ar_invoices
- [ ] Pull account mapping from activities for actual cost posting

---

## 💸 Accounts Payable (AP)

- [ ] Add status workflow: draft → approved → posted
- [ ] Prevent posting unless all invoice lines are mapped to valid GL accounts
- [ ] Attach invoice lines to cost_lines and/or activity actuals
- [ ] Validate invoice totals and match against budgets
- [ ] On approval, auto-post to:
  - AP Liability
  - Expense (or WIP or Prepaid) accounts based on vendor or cost type
- [ ] Update vendor balances and aging schedules
- [ ] Trigger payment due tracking
- [ ] Add elimination logic if vendor is an internal company (intercompany payable)

---

## 💰 Accounts Receivable (AR)

- [ ] Support AR invoice creation (manual and recurring)
- [ ] Link AR invoices to activities, milestones, or schedules
- [ ] Recognize revenue based on:
  - Activity completion percentage
  - Cost incurred thresholds
- [ ] Auto-post GL entries on billing or payment:
  - Debit Accounts Receivable
  - Credit Revenue
- [ ] Track client balances and invoice aging
- [ ] Allow partial payments and credit memos
- [ ] Apply payments and clear matched invoices

---

## 🧩 Shared Logic

- [ ] Implement status engine for draft → approved → posted workflows
- [ ] Maintain mapping table: activity/category → GL account
- [ ] Link documents to journal entries with foreign keys
- [ ] Middleware to enforce fiscal period rules
- [ ] Add schema support to link cost_lines, invoices, journal entries
- [ ] Prepare for scheduler integration (AR billing, period-end routines)

---

This phase assumes all scaffolding is complete and moves the project into core business rule implementation.