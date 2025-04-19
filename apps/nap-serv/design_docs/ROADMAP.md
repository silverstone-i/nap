# nap-serve Development Roadmap

This roadmap outlines the phased development plan for the nap-serve backend system. Each phase includes key deliverables and feature groupings necessary to achieve a high-quality project-based accounting and reporting platform.

---

## 🚧 Phase 1: Infrastructure & Core Setup

### Goals:
- Establish foundational architecture for multi-tenant support and developer productivity

### Deliverables:
- Tenant schema isolation and tenant management
- Express API scaffolding and middleware (tenant context, auth)
- BaseModel integration with schema-qualified queries
- Initial PostgreSQL schema migrations (tenants, companies, users)

---

## 📊 Phase 2: Project Costing Engine

### Goals:
- Support core activity code structure and project budgeting

### Deliverables:
- Activity codes with material/labor cost support
- Activity groupings for construction, BOM, bid packages
- Project and activity table models
- Budget table per project/account/activity
- Budget input and revision endpoints

---

## 💸 Phase 3: Financial Core (GL, AP, AR)

### Goals:
- Establish full double-entry GL and transactional input points

### Deliverables:
- General ledger with journal entry API
- Chart of accounts and company-account assignment
- Accounts payable (vendor bills, labor logs, material use)
- Basic accounts receivable (incoming payments, billing units)
- GL posting rules for cost/revenue events

---

## 🔄 Phase 4: Intercompany Accounting

### Goals:
- Allow multiple companies per tenant with internal billing and eliminations

### Deliverables:
- Intercompany transaction engine
- Auto-generated journal entries for internal services
- Due-to / due-from account mappings
- Elimination tagging and logic

---

## 📈 Phase 5: Consolidated Reporting

### Goals:
- Generate financial reports across companies and projects with eliminations

### Deliverables:
- Consolidated P&L and balance sheet
- Project margin and cost summaries
- Intercompany elimination report
- Budget vs actual report
- Initial dashboard view

---

## 🔐 Phase 6: Security & Roles

### Goals:
- Implement secure and permission-aware system behavior

### Deliverables:
- Role-based access control with default roles
- Project and feature-level permission enforcement
- Scoped access to data and actions

---

## 🧪 Phase 7: QA, Hardening, and Beta Release

### Goals:
- Prepare system for initial user adoption

### Deliverables:
- Integration and load tests
- Error handling and audit logging
- Data seeding and test fixtures
- Internal beta with seed tenants and data

---

## 🌍 Future Enhancements (Post-MVP)

- Project scheduling with dependencies
- Change order and committed cost tracking
- Invoicing engine and retainage
- AI-based alerts and forecasting
- Multi-currency and tax engine
- Workflow automation and approvals
- External system integrations (QuickBooks, payroll)
