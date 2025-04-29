# nap-serv Development Roadmap and Operational Checklist

This document combines the full development roadmap for nap-serve and the current operational procedures for maintaining modules, APIs, and upcoming system enhancements.

---

# 📍 Development Roadmap

## 🚧 Phase 1: Infrastructure & Core Setup ✅ Complete

### Goals:
- Establish foundational architecture for multi-tenant support and developer productivity

### Deliverables:
- Tenant schema isolation and tenant management
- Express API scaffolding and middleware (tenant context, auth)
- BaseModel integration with schema-qualified queries
- Initial PostgreSQL schema migrations (`tenants`, `nap_users` tables)

---

## 📊 Phase 2: Project Costing Engine 🛠️ In Progress

### Goals:
- Support core activity code structure and project budgeting

### Deliverables:
- Activity codes with material/labor cost support
- Activity groupings for construction, BOM, bid packages
- Project and activity table models
- Budget table per project/account/activity
- Budget input and revision endpoints

---

## 💸 Phase 3: Financial Core (GL, AP, AR) 🚧 Not Started

### Goals:
- Establish full double-entry GL and transactional input points

### Deliverables:
- General ledger with journal entry API
- Chart of accounts and company-account assignment
- Accounts payable (vendor bills, labor logs, material use)
- Basic accounts receivable (incoming payments, billing units)
- GL posting rules for cost/revenue events

---

## 🔄 Phase 4: Intercompany Accounting 🚧 Not Started

### Goals:
- Allow multiple companies per tenant with internal billing and eliminations

### Deliverables:
- Intercompany transaction engine
- Auto-generated journal entries for internal services
- Due-to / due-from account mappings
- Elimination tagging and logic

---

## 📈 Phase 5: Consolidated Reporting 🚧 Not Started

### Goals:
- Generate financial reports across companies and projects with eliminations

### Deliverables:
- Consolidated P&L and balance sheet
- Project margin and cost summaries
- Intercompany elimination report
- Budget vs actual report
- Initial dashboard view

---

## 🔐 Phase 6: Security & Roles 🚧 Not Started

### Goals:
- Implement secure and permission-aware system behavior

### Deliverables:
- Role-based access control with default roles
- Project and feature-level permission enforcement
- Scoped access to data and actions

---

## 🧪 Phase 7: QA, Hardening, and Beta Release 🚧 Not Started

### Goals:
- Prepare system for initial user adoption

### Deliverables:
- Integration and load tests
- Error handling and audit logging
- Data seeding and test fixtures
- Internal beta with seed tenants and data

---

## 🌍 Future Enhancements (Post-MVP) 🚧 Not Started

- Project scheduling with dependencies
- Change order and committed cost tracking
- Invoicing engine and retainage
- AI-based alerts and forecasting
- Multi-currency and tax engine
- Workflow automation and approvals
- External system integrations (QuickBooks, payroll)

---

# 📋 Operational Checklist

## ✅ Current State (April 2025)

### 🚀 Adding a New Module (Dynamic Loading) ✅ Complete

- Modules dynamically loaded via `apiRoutes.js`
- Auto-scan and auto-mount `v1/`, `v2/`, etc.

---

### 🚀 Adding a New Version ✅ Complete

- Drop into `/v2/`
- Dynamic detection enabled
- No manual edits required

---

### 🚀 Adding a New API to Existing Module ✅ Complete

- Drop `*.Api.js` into the correct version folder
- Auto-mounted

---

## 📦 Best Practices (Current)

| Task | Status |
|:--|:--|
| New Module | ✅ Complete |
| New Version | ✅ Complete |
| New API File | ✅ Complete |
| Version Routing | ✅ Complete |

---

# 🌟 Future Opportunities (Technical Roadmap)

### 🔮 Dynamic Module Loading Per Tenant 🚧 Planned

- Per-tenant feature module loading based on tenant identity.
- Dynamic module building at request time.

---

### 🔮 Tenant-Specific Router Caching 🚧 Planned

- Cache routers after build to optimize performance.

---

### 🔮 PostgreSQL Tenant-Module Mapping 🚧 Planned

- Store tenant-enabled modules in a database table.
- Allow admin-driven module changes without redeploy.

---

# 📚 End of Document