# Tenant Design Summary for nap-serv

## 1. Tenant Definition
- A **tenant** is a customer of the nap-serv platform.
- Tenants operate independent businesses with **isolated data**.
- Data isolation is enforced using **PostgreSQL schemas** (`tenant_abc`, `tenant_xyz`, etc.).
- Only **nap superusers** have access to the `admin.tenants` table and can manage tenants across the system.

---

## 2. API Routing and Authentication

### Routing Isolation
- All API routes are **shared across tenants**.
- Tenant context is enforced via:
  - **JWT/session** containing `tenant_id`
  - **Middleware** sets `search_path` to the correct schema
  - Superusers may override context to access other tenants

### Authentication Model (Option 2)
- Use a **central `admin.nap_users` table** for all user logins
- Each user row includes:
  - `tenant_id`: identifies the tenant context
  - `employee_id`: (optional) links to a record in the tenant's `employees` table
- Only certain employees will be present in `nap_users` (those needing access)

---

## 3. Tenant Provisioning Workflow

1. **Create tenant record** in `admin.tenants`
2. **Create schema** for the tenant (e.g., `CREATE SCHEMA tenant_ast`)
3. **Run schema migrations** via pg-schemata for that schema
4. **Create initial admin user** in `admin.nap_users`
5. **Optionally seed** categories, accounts, etc.
6. **Activate login** and notify the tenant

---

## 4. Schema Structure Guidelines

- All tenant-local tables **must include**:
  - `id`: primary key (`uuidv7()`)
  - `tenant_id`: always present for audit integrity and possible shared-model fallback
- Tables will **not include `tenant_id` in UNIQUE constraints** because:
  - Schemas already isolate data
  - Avoids index bloat and performance overhead
- UNIQUE constraints like `UNIQUE(category_id)` are scoped naturally by schema

---

## 5. Future Cleanup
- Once test coverage is complete, revisit existing `UNIQUE (tenant_id, ...)` constraints and refactor them
- Ensure `pg-schemata` reflects updated rules for constraint generation under schema-based isolation