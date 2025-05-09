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

## 📊 Phase 2: Project Costing Engine ✅ Complete

### Goals:
- Support core activity code structure and project budgeting

### Deliverables:
- Activity codes with material/labor cost support
- Activity groupings for construction, BOM, bid packages
- Project and activity table models
- Budget table per project/account/activity
- Budget input and revision endpoints
- Projects table is currently managed within the activities module to support integrated costing and profitability reporting; may migrate to a dedicated project management module in a future phase.

✅ Phase 2 Complete: Core project costing engine implemented with tested integration of units, activities, budgets, and cost lines. Integration tests validate data aggregation and relational integrity. Business logic deferred to Phase 5.

### Remaining Technical Tasks (Pre-Business Logic)

- [x] Complete model integration between `project_unit_budgets`, `activities`, and `cost_lines`
- [x] Add API endpoints for `project_unit_budgets`
- [x] Support POST and GET routes to seed and fetch budget rows per activity
- [x] Verify cost line schema can support downstream accounting references (e.g., GL mapping)
- [x] Implement basic costing data aggregation queries for summaries (project-level, category-level)

---

## 💸 Phase 3: Financial Core (GL, AP, AR) ✅ Complete

✅ Phase 3 Complete: Full scaffolding for GL, AP, and AR modules is implemented and tested. This includes schema definitions, models, routes, controllers, and integration tests. Business logic integration deferred to Phase 5.

---

## 🔄 Phase 4: Intercompany Accounting ✅ Complete

✅ Phase 4 Complete: Intercompany transaction engine, account mapping, auto-generated journal entries, and elimination tagging are implemented and tested.

---

## ⚙️ Phase 5: Project & Accounting Logic 🚧 Not Started

### Goals:
- Implement domain-specific rules for costing, approvals, and GL integration

### Deliverables:
- Budget → Actual status transitions
- Activity ↔ GL/account mapping logic
- Posting rules for cost_lines, actuals, and change_orders
- Full integration tests for costing workflows

---

## 📈 Phase 6: Consolidated Reporting 🚧 Not Started

### Goals:
- Generate financial reports across companies and projects with eliminations

### Deliverables:
- Consolidated P&L and balance sheet
- Project margin and cost summaries
- Intercompany elimination report
- Budget vs actual report
- Initial dashboard view

---

## 🔐 Phase 7: Security & Roles 🚧 Not Started

### Goals:
- Implement secure and permission-aware system behavior

### Deliverables:
- Role-based access control with default roles
- Project and feature-level permission enforcement
- Scoped access to data and actions

---

## 🧪 Phase 8: QA, Hardening, and Beta Release 🚧 Not Started

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

## ✅ Current State (May 2025)

### ✅ Module Development Progress

- Activities, Units, Budgets: Fully implemented with tested integration
- Accounting (GL, AP, AR): Full scaffolding complete and tested
- Intercompany: Functional and tested
- Migration Engine: Supports dependency-aware ordering
- Controllers/Routes: All current modules scaffolded with CRUD and tests

### 🚀 Adding a New Module (Dynamic Loading) ✅ Complete

```
❌ Deprecated in favor of static route registration to improve compatibility with Jest and ESM modules.
```

---

### 🚀 Adding a New Version ✅ Complete

```
❌ Deprecated. Version folders are now manually registered to support better testability and clarity.
```

---

### 🚀 Adding a New API to Existing Module ✅ Complete

```
❌ Deprecated. APIs must now be statically imported and registered in the route index to enable controller-level test mocking.
```

---

## 📦 Best Practices (Current)

| Task              | Status       |
|-------------------|--------------|
| New Module        | ✅ Static Only |
| New Version       | ❌ Deprecated |
| New API File      | ❌ Deprecated |
| Version Routing   | ✅ Static Only |

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