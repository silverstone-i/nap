# NAP Initial Table Schema

> **Planning reference only.**
> [Specification — Database record conventions](../specs/nap-platform-specification.md#database-record-conventions)
> is authoritative for table profiles, common columns, actors, timestamps,
> deletion, projections, reference data, and migration stability. Accepted
> component PRDs and module-owned migrations own component tables.

This document proposes an initial table inventory for the current NAP
architecture: one central administration database and one or more tenant-cell
databases using shared tables and PostgreSQL row-level security (RLS).

It is a logical schema for the first migrations. Exact indexes, checks, generated columns, and status vocabularies should be declared in the module-owned migrations.

## 1. Database boundaries

| Database     | Schema      | Purpose                                                                                                                                |
| ------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `nap_admin`  | `admin`     | Global identities, sessions, tenant registry, user-to-tenant access, cell registry, tenant-to-cell assignment, and impersonation audit |
| `nap_cell_n` | `cell`      | Cell-local tenant and user-binding projections needed for local enforcement                                                            |
| `nap_cell_n` | `reference` | Shared, non-tenant reference data and application metadata                                                                             |
| `nap_cell_n` | `app`       | Shared tenant business tables; every row is tenant-scoped and protected by RLS                                                         |
| `nap_cell_n` | `reporting` | Tenant-aware views over RLS-protected `app` tables                                                                                     |

There are no cross-database foreign keys. Central identifiers copied into a cell remain UUIDs, and the application is responsible for synchronizing them through controlled provisioning and membership workflows.

## 2. Shared conventions

### Central-table columns

Unless a table says otherwise, central tables have:

```text
id              uuid          primary key, default gen_random_uuid(), immutable
created_at      timestamptz   not null, default now()
updated_at      timestamptz   not null, default now()
created_by      uuid          nullable actor id
updated_by      uuid          nullable actor id
deactivated_at  timestamptz   nullable soft-delete marker
```

### Tenant-table columns

Every table in `app`, including child and junction tables, has:

```text
id              uuid          primary key, default gen_random_uuid(), immutable
tenant_id       uuid          not null, immutable
created_at      timestamptz   not null, default now()
updated_at      timestamptz   not null, default now()
created_by      uuid          nullable central portal-user id
updated_by      uuid          nullable central portal-user id
deactivated_at  timestamptz   nullable unless the table is append-only
```

Required rules:

- `tenant_id` references `cell.tenants(id)`.
- Each tenant table exposes `UNIQUE (tenant_id, id)` as the target for composite foreign keys.
- A child relation uses `FOREIGN KEY (tenant_id, parent_id) REFERENCES app.parent_table (tenant_id, id)`.
- Tenant-specific natural keys include `tenant_id`, normally with a partial unique index where `deactivated_at IS NULL`.
- Every foreign key is indexed and declares its deletion behavior.
- Financial postings, approvals, impersonation logs, and other audit records are append-only; corrections use reversal or superseding rows.
- Money uses `numeric(14,2)` unless the module needs a larger range. Quantities and unit prices use `numeric(12,4)`. Currency uses ISO `char(3)`.
- Dates use `date`; events use `timestamptz`.
- Short workflow values use `text` plus migration-owned `CHECK` constraints unless a reference table is required.
- Actor UUIDs copied from the central database are not cross-database foreign keys.

### RLS pattern

`ARCH-017` and `ARCH-019`, with the specification's
[database composition roots](../specs/nap-platform-specification.md#database-composition-roots) and
[tenant transaction contract](../specs/nap-platform-specification.md#tenant-transaction-contract), are the
authority on tenant isolation. RLS is enabled but never forced: the boundary is the
non-owning runtime role, and `FORCE ROW LEVEL SECURITY` would subject
migrations and data corrections to the policy as well.

Apply this pattern to every tenant-owned `app` table and to tenant-owned tables in `cell`:

```sql
ALTER TABLE app.example ENABLE ROW LEVEL SECURITY;

CREATE POLICY example_tenant_isolation
ON app.example
USING (
  tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid
);
```

The API begins a transaction and sets `nap.tenant_id` with transaction-local scope before any tenant query. The runtime role must not own tables and must not have `SUPERUSER` or `BYPASSRLS`.

`cell.tenants` is the one structural exception to the example because its tenant key is `id`; its policy compares `id` directly with the current `nap.tenant_id`. Other cell-local tenant tables use the standard `tenant_id` predicate.

## 3. Central administration database

### `admin.cells`

Registry of managed tenant cells.

```text
cell_code              varchar(32)   not null, unique while active
name                   varchar(128)  not null
region                 varchar(64)   not null
api_base_url           text          not null
status                 varchar(20)   not null  -- provisioning | active | draining | unavailable | retired
is_accepting_tenants   boolean       not null, default true
capacity_class         varchar(32)   nullable
notes                  text          nullable
```

Database hostnames and credentials are deployment secrets and do not belong in this table.

### `admin.tenants`

Authoritative tenant registry and current cell assignment.

```text
tenant_code      varchar(16)   not null, unique while active
company          varchar(128)  not null
cell_id          uuid          not null, FK admin.cells
status           varchar(20)   not null  -- pending | trial | active | suspended | moving | retired
tier             varchar(20)   not null  -- starter | growth | enterprise
region           varchar(64)   nullable
allowed_modules  jsonb         not null, default '[]'
max_users        integer       nullable
notes            text          nullable
```

There is no `schema_name`. A tenant is located by `cell_id`.

### `admin.portal_users`

One global managed-service login identity per person.

```text
email          varchar(128)  not null
password_hash  text          not null
status         varchar(20)   not null  -- active | invited | locked
```

Suggested constraint: unique normalized `email` while the row is active.

### `admin.portal_user_tenants`

Authoritative user-to-tenant access binding.

```text
portal_user_id  uuid          not null, FK admin.portal_users
tenant_id       uuid          not null, FK admin.tenants
user_type       varchar(20)   not null
entity_id       uuid          not null  -- matching entity in the assigned cell; no cross-database FK
status          varchar(20)   not null  -- active | invited | locked
last_used_at    timestamptz   nullable
```

Suggested constraints:

- unique active `(portal_user_id, tenant_id)`;
- unique active `(tenant_id, entity_id)`;

`user_type` belongs to this tenant binding, not to the global identity. The same person can therefore have a different relationship with another tenant without creating another login.

### `admin.sessions`

Server-side record for refresh-token rotation and revocation.

```text
portal_user_id  uuid          not null, FK admin.portal_users
token_hash      text          not null, unique
idle_expires_at timestamptz   not null
absolute_expires_at timestamptz nullable
last_seen_at    timestamptz   nullable
revoked_at      timestamptz   nullable
```

### `admin.impersonation_logs`

Append-only audit of managed-service impersonation.

```text
impersonator_id  uuid          not null, FK admin.portal_users
target_user_id   uuid          not null, FK admin.portal_users
target_tenant_id uuid          not null, FK admin.tenants
reason           text          not null
started_at       timestamptz   not null
ended_at         timestamptz   nullable
```

## 4. Cell infrastructure and reference tables

### `cell.tenants`

Cell-local projection of tenants assigned to this cell. The central record remains authoritative.

```text
id               uuid          primary key; same id as admin.tenants
tenant_code      varchar(16)   not null, unique
company          varchar(128)  not null
status           varchar(20)   not null
allowed_modules  jsonb         not null, default '[]'
admin_revision   bigint        not null
synced_at        timestamptz   not null
```

### `cell.tenant_user_bindings`

Cell-local projection used where business tables need a locally enforceable user-membership reference.

```text
id                uuid          primary key; same id as admin.portal_user_tenants
tenant_id         uuid          not null, FK cell.tenants
portal_user_id    uuid          not null
user_type         varchar(20)   not null
entity_id         uuid          not null
status            varchar(20)   not null
admin_revision    bigint        not null
synced_at         timestamptz   not null
```

Suggested constraints: unique `(tenant_id, id)`, unique active `(tenant_id, portal_user_id)`, and unique active `(tenant_id, entity_id)`. This table is protected by RLS.

### `reference.countries`

Cell-local ISO country reference so tenant tables can use real foreign keys without reaching the central database.

```text
code         char(2)       primary key
name         varchar(128)  not null
dial_code    varchar(8)    nullable
placeholder  varchar(64)   nullable
```

### `reference.policy_catalog`

Read-only seed registry of valid RBAC targets. It is application metadata shared by all tenants in a cell.

```text
module            varchar(32)   not null
router            varchar(64)   not null
action            varchar(32)   not null
label             varchar(128)  not null
description       varchar(512)  nullable
sort_order        integer       not null
valid_statuses    text[]        not null, default '{}'
available_fields  text[]        not null, default '{}'
policy_required   boolean       not null, default false
```

Primary key: `(module, router, action)`.

## 5. Cell business tables

All tables below are in the `app` schema and include the tenant-table columns defined in §2.

### Core master data

| Table             | Module fields                                                                                                                                                                                                                                | Key relationships and constraints                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sources`         | `table_id uuid`, `source_type varchar(32)`, `label varchar(64)`                                                                                                                                                                              | Unique active `(tenant_id, table_id, source_type)`; owner registry for polymorphic contact data |
| `vendors`         | `source_id uuid`, `name varchar(128)`, `code varchar(16)`, `payment_term_id uuid`, `is_active boolean`, `notes text`                                                                                                                         | Composite FKs to `sources` and `payment_terms`; unique active `(tenant_id, code)`               |
| `vendor_contacts` | `vendor_id uuid`, `source_id uuid`, `first_name varchar(64)`, `last_name varchar(64)`, `position varchar(64)`, `department varchar(64)`, `is_app_user boolean`, `roles text[]`, `is_primary boolean`                                         | Composite FKs to `vendors` and `sources`                                                        |
| `clients`         | `source_id uuid`, `name varchar(128)`, `code varchar(16)`, `roles text[]`, `is_app_user boolean`, `is_active boolean`                                                                                                                        | Composite FK to `sources`; unique active `(tenant_id, code)`                                    |
| `employees`       | `source_id uuid`, `first_name varchar(64)`, `last_name varchar(64)`, `code varchar(16)`, `position varchar(64)`, `department varchar(64)`, `roles text[]`, `is_app_user boolean`, `is_primary_contact boolean`, `is_billing_contact boolean` | Composite FK to `sources`; unique active `(tenant_id, code)`                                    |
| `contacts`        | `source_id uuid`, `name varchar(128)`, `code varchar(16)`, `is_active boolean`                                                                                                                                                               | Composite FK to `sources`; unique active `(tenant_id, code)`                                    |
| `companies`       | `source_id uuid`, `code varchar(16)`, `name varchar(128)`, `is_active boolean`                                                                                                                                                               | Composite FK to `sources`; unique active `(tenant_id, code)`                                    |
| `company_members` | `company_id uuid`, `tenant_user_binding_id uuid`                                                                                                                                                                                             | Composite FKs to `companies` and `cell.tenant_user_bindings`; unique active pair                |
| `payment_terms`   | `label varchar(64)`, `term integer`, `units varchar(16)`, `is_active boolean`                                                                                                                                                                | Unique active `(tenant_id, label)`; units: days or months                                       |
| `addresses`       | `source_id uuid`, `label varchar(32)`, address lines, city, state/province, postal code, `country_code char(2)`, `is_primary boolean`                                                                                                        | Composite FK to `sources`; country FK to `reference.countries`                                  |
| `phone_numbers`   | `source_id uuid`, `phone_type varchar(16)`, `country_code char(2)`, `phone_number varchar(32)`, `is_primary boolean`                                                                                                                         | Composite FK to `sources`; country FK to `reference.countries`                                  |
| `emails`          | `source_id uuid`, `email varchar(128)`, `label varchar(32)`, `is_primary boolean`, `is_login boolean`                                                                                                                                        | Composite FK to `sources`; unique active normalized `(tenant_id, email)`                        |
| `tax_identifiers` | `source_id uuid`, `country_code char(2)`, `tax_type varchar(16)`, `tax_value_encrypted text`, `tax_value_hash text`, `is_primary boolean`                                                                                                    | Composite FK to `sources`; country FK; encrypt value and use hash for equality checks           |

### RBAC and tenant configuration

| Table                          | Module fields                                                                                                                          | Key relationships and constraints                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `roles`                        | `code varchar(32)`, `name varchar(64)`, `description text`, `is_system boolean`, `is_immutable boolean`, `scope varchar(32)`           | Unique active `(tenant_id, code)`; scope: all_projects, assigned_companies, assigned_projects, or self |
| `policies`                     | `role_id uuid`, `module varchar(32)`, `router varchar(64)`, `action varchar(32)`, `level varchar(8)`                                   | Composite FK to `roles`; FK target tuple to `reference.policy_catalog`; unique active grant            |
| `state_filters`                | `role_id uuid`, `module varchar(32)`, `router varchar(64)`, `visible_statuses text[]`                                                  | Composite FK to `roles`; unique active `(tenant_id, role_id, module, router)`                          |
| `field_group_definitions`      | `module varchar(32)`, `router varchar(64)`, `group_name varchar(64)`, `columns text[]`, `is_default boolean`                           | Unique active `(tenant_id, module, router, group_name)`                                                |
| `field_group_grants`           | `role_id uuid`, `field_group_id uuid`                                                                                                  | Composite FKs to `roles` and `field_group_definitions`; unique active pair                             |
| `approvals`                    | `entity_type varchar(32)`, `entity_id uuid`, `action varchar(32)`, `prior_status varchar(20)`, `new_status varchar(20)`, `reason text` | Append-only polymorphic workflow audit; index `(tenant_id, entity_type, entity_id, created_at)`        |
| `tenant_approval_config`       | `workflow_type varchar(32)`, `require_approval boolean`                                                                                | Unique active `(tenant_id, workflow_type)`                                                             |
| `tenant_numbering_config`      | `id_type varchar(32)`, prefix/suffix, date/reset modes, padding, separator, uppercase, `scope_type varchar(32)`, `is_enabled boolean`  | Unique active `(tenant_id, id_type)`                                                                   |
| `tenant_number_sequence_state` | `id_type varchar(32)`, `scope_id uuid`, `period_key varchar(16)`, `last_serial bigint`                                                 | Unique `(tenant_id, id_type, scope_id, period_key)`; update atomically                                 |
| `tenant_preferences`           | `default_page_size integer`                                                                                                            | One active row per tenant                                                                              |

### Projects

| Table                 | Module fields                                                                                                                                                                                    | Key relationships and constraints                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `projects`            | `company_id uuid`, `address_id uuid`, `project_code varchar(32)`, `name varchar(255)`, description, notes, `status varchar(20)`, `contract_amount numeric(14,2)`                                 | Composite FKs to `companies` and `addresses`; unique active `(tenant_id, project_code)`                       |
| `project_clients`     | `project_id uuid`, `client_id uuid`, `role varchar(32)`, `is_primary boolean`                                                                                                                    | Composite FKs to `projects` and `clients`; unique active project/client pair                                  |
| `project_members`     | `project_id uuid`, `tenant_user_binding_id uuid`, `role varchar(32)`                                                                                                                             | Composite FKs to `projects` and `cell.tenant_user_bindings`; unique active pair                               |
| `units`               | `project_id uuid`, `template_unit_id uuid`, `version_used integer`, `name varchar(128)`, `unit_code varchar(32)`, `status varchar(20)`                                                           | Composite FKs to `projects` and optional `template_units`; unique active `(tenant_id, project_id, unit_code)` |
| `task_groups`         | `code varchar(16)`, `name varchar(64)`, `description text`, `sort_order integer`                                                                                                                 | Unique active `(tenant_id, code)`                                                                             |
| `tasks_master`        | `code varchar(16)`, `task_group_id uuid`, `name varchar(128)`, `default_duration_days integer`                                                                                                   | Composite FK to `task_groups`; unique active `(tenant_id, code)`                                              |
| `tasks`               | `unit_id uuid`, `task_code varchar(16)`, `name varchar(128)`, `duration_days integer`, `status varchar(20)`, `parent_task_id uuid`                                                               | Composite FKs to `units` and self; unique active `(tenant_id, unit_id, task_code)`                            |
| `cost_items`          | `task_id uuid`, `item_code varchar(16)`, description, `cost_class varchar(16)`, `cost_source varchar(16)`, `quantity numeric(12,4)`, `unit_cost numeric(12,4)`, generated `amount numeric(14,2)` | Composite FK to `tasks`; unique active `(tenant_id, task_id, item_code)`                                      |
| `template_units`      | `name varchar(128)`, `version integer`, `status varchar(20)`                                                                                                                                     | Unique active `(tenant_id, name, version)`                                                                    |
| `template_tasks`      | `template_unit_id uuid`, `task_code varchar(16)`, name, duration, `parent_code varchar(16)`                                                                                                      | Composite FK to `template_units`; unique active `(tenant_id, template_unit_id, task_code)`                    |
| `template_cost_items` | `template_task_id uuid`, item code, description, cost class/source, quantity, unit cost, generated amount                                                                                        | Composite FK to `template_tasks`; unique active item code per template task                                   |

Projects retains operational change control and any reusable operational
change templates. Contractual change orders belong to Contracts under
`ARCH-046`; the component PRDs will choose their exact table names and fields.

### Activities and budgets

| Table                     | Module fields                                                                                                                          | Key relationships and constraints                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `categories`              | `code varchar(16)`, `name varchar(64)`, `type varchar(16)`                                                                             | Unique active `(tenant_id, code)`                                                          |
| `activities`              | `category_id uuid`, `code varchar(16)`, `name varchar(64)`, `is_active boolean`                                                        | Composite FK to `categories`; unique active `(tenant_id, category_id, code)`               |
| `deliverables`            | name, description, `effect varchar(16)`, `status varchar(20)`, start/end dates                                                         | Index `(tenant_id, status)`                                                                |
| `deliverable_assignments` | `deliverable_id uuid`, `project_id uuid`, `employee_id uuid`, notes                                                                    | Composite FKs to all parents; unique active assignment                                     |
| `budgets`                 | `deliverable_id uuid`, `activity_id uuid`, amount, version, current flag, status, submit/approve actors and timestamps                 | Composite FKs; unique `(tenant_id, deliverable_id, activity_id, version)`; one current row |
| `cost_lines`              | company, deliverable, vendor, activity and budget IDs; tenant SKU, source type, quantity, unit price, generated amount, markup, status | Composite FKs to local parents; index project-cost reporting paths                         |
| `actual_costs`            | `activity_id uuid`, `project_id uuid`, amount, currency, reference, approval status, incurred date                                     | Composite FKs to `activities` and `projects`                                               |
| `vendor_parts`            | `vendor_id uuid`, vendor SKU, tenant SKU, unit cost, currency, markup, active flag                                                     | Composite FK to `vendors`; unique active `(tenant_id, vendor_id, vendor_sku)`              |

### Accounts payable

| Table                 | Module fields                                                                                  | Key relationships and constraints                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ap_invoices`         | company, vendor and project IDs; invoice number/date, due date, total, currency, status, notes | Composite FKs; unique active `(tenant_id, vendor_id, invoice_number)`              |
| `ap_invoice_lines`    | `invoice_id uuid`, optional cost line/activity/account IDs, description, amount                | Composite FKs to invoice and referenced local rows                                 |
| `payments`            | vendor ID, optional convenience invoice ID, payment date, amount, method, reference, notes     | Composite FKs; append financial events rather than destructive edits after posting |
| `payment_allocations` | `payment_id uuid`, `ap_invoice_id uuid`, amount                                                | Composite FKs; unique payment/invoice pair                                         |
| `ap_credit_memos`     | vendor/invoice IDs, credit number/date, amount, reason, status                                 | Composite FKs; unique active `(tenant_id, vendor_id, credit_number)`               |

### Sales and Contracts

Sales planning includes opportunities, quotes, buyer selections, and approval
workflows. Contracts planning includes binding customer, vendor, subcontract,
land-purchase, and other agreements; immutable scope and pricing snapshots;
versions; amendments; contractual change orders; milestones; and execution
history. The component PRDs will define exact tables and fields.

The earlier billing-agreement and project change-order proposals belong to
Contracts when they represent binding obligations or amendments. Contracts
records milestones and emits auditable events; A/R, A/P, and other consumers
retain ownership of the downstream records they decide to create.

### Accounts receivable

| Table                 | Module fields                                                                                                          | Key relationships and constraints                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `ar_invoices`         | company, client, project, deliverable and agreement IDs; invoice number/date, due date, total, currency, status, notes | Composite FKs; invoice-number uniqueness includes tenant and its configured scope |
| `ar_invoice_lines`    | `invoice_id uuid`, optional account ID, description, amount                                                            | Composite FKs to invoice and account                                              |
| `receipts`            | client ID, optional convenience invoice ID, receipt date, amount, method, reference, notes                             | Composite FKs; append financial events after posting                              |
| `receipt_allocations` | `receipt_id uuid`, `ar_invoice_id uuid`, amount                                                                        | Composite FKs; unique receipt/invoice pair                                        |

### Accounting

| Table                       | Module fields                                                                                         | Key relationships and constraints                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ledgers`                   | company ID, code, name, basis, default flag, status                                                   | Composite FK to `companies`; unique active `(tenant_id, company_id, code)`; one default per company/basis |
| `company_accounting_config` | company ID, book basis, revenue-recognition policy, WIP policy                                        | Composite FK; one active row per company                                                                  |
| `chart_of_accounts`         | code, name, type, active flag, encrypted bank details where required                                  | Unique active `(tenant_id, code)`; do not store unencrypted account/routing values                        |
| `journal_entries`           | company, ledger, optional project IDs; entry date, description, status, source type/id, correction ID | Composite FKs; posted rows immutable; corrections reference original                                      |
| `journal_entry_lines`       | entry/account IDs, debit, credit, memo, related table/id                                              | Composite FKs; check exactly one of debit/credit is positive                                              |
| `ledger_balances`           | ledger/account IDs, as-of date, balance                                                               | Composite FKs; append-only; unique `(tenant_id, ledger_id, account_id, as_of_date)`                       |
| `posting_queues`            | journal entry ID, status, error message, processed timestamp                                          | Composite FK; unique active queue item per journal entry                                                  |
| `posting_rules`             | ledger ID, event type, debit/credit account roles, recognition date, validity dates                   | Composite FK; no overlapping active period for the same ledger/event                                      |
| `category_account_map`      | category/account IDs, validity dates                                                                  | Composite FKs; no overlapping period for a category                                                       |
| `company_accounts`          | source/target company IDs, intercompany account ID, active flag                                       | Composite FKs; unique active company pair                                                                 |
| `company_transactions`      | source/target company and journal-entry IDs, module, amount, status, elimination flag, description    | Composite FKs; posted rows immutable                                                                      |
| `internal_transfers`        | from/to account IDs, transfer date, amount, description                                               | Composite FKs; accounts must differ                                                                       |
| `fiscal_periods`            | company/ledger IDs, fiscal year, period number, name, date range, status, close/lock timestamps       | Composite FKs; non-overlapping ranges per ledger; unique year/period                                      |

### Catalog add-on

The catalog tables exist in every cell migration so all tenants in a shared database have the same physical schema. The API blocks their use unless the tenant's entitlement includes the catalog module.

| Table               | Module fields                                                                                        | Key relationships and constraints                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `catalog_items`     | catalog SKU, description/normalized description, category, subcategory, model, optional embedding    | Unique active `(tenant_id, catalog_sku)`; pgvector column is migration-managed                      |
| `bom_components`    | parent/child item IDs, quantity                                                                      | Composite FKs to `catalog_items`; unique pair; parent and child differ; application prevents cycles |
| `vendor_skus`       | vendor ID, vendor SKU, descriptions, optional catalog item ID, confidence, model, optional embedding | Composite FKs; unique active `(tenant_id, vendor_id, vendor_sku)`                                   |
| `vendor_pricing`    | vendor SKU ID, unit price, unit, effective date                                                      | Composite FK; unique `(tenant_id, vendor_sku_id, effective_date)`                                   |
| `match_review_logs` | entity type/id, match type/id, reviewer portal-user ID, decision, notes                              | Append-only audit; index entity and reviewer paths                                                  |

## 6. Reporting views

Create these in the `reporting` schema. Each view includes `tenant_id`, joins on both `tenant_id` and record ID, and is created as a PostgreSQL 15+ security-invoker view so the caller's privileges and RLS policies apply to the base tables:

```sql
CREATE VIEW reporting.example
WITH (security_invoker = true)
AS
SELECT ...
FROM app.example;
```

- `reporting.vw_project_profitability`;
- `reporting.vw_project_cashflow_monthly`;
- `reporting.vw_project_cost_by_category`;
- `reporting.vw_ar_aging`;
- `reporting.vw_ap_aging`;
- flattened contact, address, and template export views.

The runtime reporting role must not bypass RLS. Do not use an owner-executed view that can bypass the caller's base-table policies. Materialized views, if added later, require an explicit tenant-safe refresh and access design and must not be treated as automatically protected by base-table RLS.

## 7. Initial migration order

### Central database

1. Extensions and admin schema.
2. `admin.cells`.
3. `admin.tenants`.
4. `admin.portal_users`.
5. `admin.portal_user_tenants`.
6. `admin.sessions`.
7. `admin.impersonation_logs`.

### Each cell database

1. Extensions and schemas.
2. `reference.countries` and `reference.policy_catalog`.
3. `cell.tenants` and `cell.tenant_user_bindings`.
4. Core master data.
5. RBAC and tenant configuration.
6. Projects.
7. Activities and budgets.
8. Catalog.
9. Sales and Contracts.
10. Accounting reference tables.
11. AP and AR.
12. Journal, posting, and intercompany tables.
13. Reporting views.
14. RLS policies, grants, and negative isolation tests.

Provisioning a tenant inserts the central tenant and membership records in a pending state, creates the cell-local tenant projection and seed data, synchronizes local user bindings, verifies the RLS boundary, and only then marks the tenant active.
