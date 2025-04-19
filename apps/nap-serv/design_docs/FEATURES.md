# nap-serve System Design Discussion Summary

This document summarizes the complete architectural and functional discussion leading to the design of `nap-serve`. Tangential topics are grouped and synthesized for clarity.

---

## 🔐 Tenant and Schema Architecture

- Each tenant represents a customer with isolated data.
- A PostgreSQL schema is assigned per tenant (e.g. `tenant_xyz`).
- All tables include a `tenant_id` column and must enforce isolation.
- Middleware extracts the tenant from JWT or headers and injects it into request context.
- All SQL calls use `"schema"."table"` syntax (not `SET search_path`) for safety and clarity.
- All BaseModel queries are schema-qualified and validated for cross-schema safety.

---

## 🧱 Activity Codes and Grouping

### Purpose
- Activities describe units of work in a project (e.g. framing, electrical rough-in).
- Designed to support:
  - Turnkey pricing
  - Bill of materials (BOM)
  - Vendor bidding (bid packages)

### Structure
- Each activity includes:
  - Material cost
  - Labor cost
  - Unit of measure
  - Quantity
- Groupings:
  - Construction group (1:1 or 1:many)
  - BOM group (1:many)
  - Bid packages (sent to vendors)

---

## 📊 Estimating, Budgeting, and Cost Tracking

### Budgeting
- Budget by project, activity code, and GL account
- Track both material and labor costs
- Budget versions are supported with lock/revision capabilities

### Actuals
- Tracked through:
  - Vendor bills
  - Labor logs
  - Material usage
- Each cost is linked to a project, optionally to an activity and/or billing unit

### Progress
- Track % completion per activity or group
- Used to trigger billing readiness
- Manual or task-driven progress updates supported

---

## 🧾 Billing, Draws, and Revenue Models

### Supported Billing Models
- Fixed price
- Cost-plus with draw-downs
- Milestone-based billing
- Final-sale model (e.g. spec homes)

### Billing Units
- Abstract representation of a milestone, draw, or revenue event
- Each cost can be mapped to a billing unit (manually or by rule)
- Revenue is recognized per billing unit

---

## 📥 Accounts Payable (AP)

- Vendor bills, labor logs, and materials are recorded per project
- All AP entries result in GL postings
- Future support planned for approval workflows and committed cost tracking

---

## 📤 Accounts Receivable (AR)

- Payments are recorded against billing units or projects
- Invoices not required in MVP
- Retainage and invoice generation deferred for future release

---

## 📒 General Ledger (GL)

- Full double-entry support with per-company books
- Each GL entry includes:
  - `project_id`, `company_id`, `account_id`
  - Optional linkage to activity or billing unit
- Supports source linking (e.g. bill, payment, labor log)

---

## 🔁 Intercompany Transactions

- One company can provide labor/materials to another’s project
- System auto-generates balanced GL entries:
  - Revenue/Expense and Due-to/Due-from lines
- Intercompany entries tagged for elimination

---

## 📊 Consolidation and Elimination

- Consolidated financial reporting at the tenant level
- Elimination of intercompany revenue and expenses
- Shared chart of accounts with intercompany mappings
- Consolidation groups define which entities are included
- Elimination entries are generated automatically and auditable

---

## 📋 Chart of Accounts (COA)

- Defined per tenant
- Companies can selectively activate accounts from the master chart
- Intercompany accounts are standardized and required for all companies
- Account tagging allows rollups and validation (e.g. `project_cost`, `intercompany`, `revenue`)

---

## 🔐 Roles and Permissions

- Default roles: Admin, Estimator, PM, Accounting, Viewer
- Permissions scoped by tenant, project, and feature
- Role-based access governs feature visibility, record creation, and posting

---

## 📈 Reporting and Dashboards

- Core reports:
  - Budget vs actual
  - GL detail
  - Project margin and profitability
  - Intercompany reconciliation
- Initial dashboard includes:
  - Key metrics by project
  - Warnings (budget overruns, unpaid balances)

---

## 📦 MVP Scope (Initial Release)

- Tenant management with schema isolation
- Project costing with activity codes and budgeting
- General ledger and AP functionality
- Basic AR for payment tracking
- Intercompany transactions and eliminations
- Consolidated reporting
- Initial dashboard and reports
- Role-based security

---

## 🔮 Post-MVP / Future Enhancements

- Project scheduling and dependency tracking
- AI-based forecasting and smart alerts
- Change order workflows
- Retainage, invoicing, and billing automation
- Multi-currency and tax handling
- Integration with external systems (e.g. QuickBooks)
- Approval workflows and audit trails

 # nap-serve Feature Overview
 
 This document outlines the functional features of the nap-serve backend system. The initial release focuses on delivering essential project accounting and reporting capabilities, while providing a foundation for future expansion.
 
 ---
 
 ## 🚀 Initial Release Features
 
 ### 🏢 Tenant Management
 - Multi-tenant support with isolated schemas per tenant
 - Master tenant registry
 - Role-based user access tied to tenant context
 
 ### 📁 Project Costing & Budgets
 - User-defined activity codes supporting both turnkey and BOM models
 - Support for material and labor cost breakdowns
 - Activity grouping for construction, BOM, and bid packages
 - Budget creation and monitoring by project, activity, and account
 
 ### 📒 General Ledger (GL)
 - Full double-entry accounting per company
 - Project-level and account-level transaction tracking
 - Support for manual and system-generated journal entries
 
 ### 📥 Accounts Payable (AP)
 - Vendor management
 - Entry and tracking of vendor bills, labor logs, and material usage
 - Posting of AP entries to GL with project and activity references
 
 ### 📤 Basic Accounts Receivable (AR)
 - Incoming payment tracking
 - Support for billing tied to projects and billing milestones
 - Payment status tracking and revenue posting to GL
 
 ### 🔄 Intercompany Billing & Eliminations
 - Transparent intercompany billing without invoices
 - Automatic generation of mirror entries across companies
 - Tagged intercompany transactions for audit and elimination
 - Consolidation-ready data model
 
 ### 📊 Consolidated Reporting
 - Consolidated P&L and balance sheet across companies
 - Intercompany elimination handling
 - Project margin and profitability reporting
 - Consolidation logic based on shared COA and company mappings
 
 ### 📈 Reporting & Dashboard
 - Budget vs actual comparisons
 - Project profitability and cash flow summaries
 - Initial dashboard with high-level KPIs
 
 ### 🔐 Security & Roles
 - Role-based access control
 - Project and feature-specific permissions
 - Support for company- and tenant-level restrictions
 
 ---
 
 ## 🔜 Future Features
 
 ### ⏳ Project Scheduling
 - Task management with dependencies
 - Progress tracking and % complete reporting
 
 ### 🤖 AI & Forecasting
 - Smart alerts (e.g. budget overrun, billing readiness)
 - Cash flow forecasting
 - Estimate validation using historical data
 
 ### 🌐 Currency & Tax Handling
 - Multi-currency transaction and reporting support
 - Tax tagging per transaction
 - FX gains/losses handling
 
 ### 📑 Invoicing & AR Enhancements
 - Full invoice generation engine
 - Retainage and holdback logic
 - Billing schedules and progress billing
 
 ### 🔁 Workflow & Automation
 - Approval flows for estimates, billing, and journal entries
 - Automated job framework for background processing
 - Notifications and escalation rules
 
 ### 📥 Integration & Import Tools
 - Accounting software integrations (e.g. QuickBooks, Xero)
 - Data import/export tools for legacy migrations