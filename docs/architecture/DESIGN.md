# NAP Design Summary

FOR REFERENCE ONLY. THIS IS A WORKING BASELINE, NOT A FINAL SPECIFICATION —
EVERY DECISION IN IT IS OPEN TO REVISION AS THE PER-MODULE DETAILED DESIGNS
TAKE SHAPE.

Reference design for NAP: a horizontal, project-native, multi-entity
enterprise resource planning (ERP) system with an industry-agnostic core,
targeting construction first. This document sketches one possible design for
the architecture, authentication, role-based access control (RBAC), and the
module/table inventory — a draft for discussion, not a decision record. A
topic becomes decided only when an ADR records it; no other document may
cite this one as authority.

## Table of Contents

- [1. Overview](#1-overview)
- [2. Architecture](#2-architecture)
  - [2.1 Multi-tenant model](#21-multi-tenant-model)
  - [2.2 API layout](#22-api-layout)
  - [2.3 Request flow](#23-request-flow)
  - [2.4 Database conventions](#24-database-conventions)
- [3. Authentication](#3-authentication)
- [4. RBAC](#4-rbac)
- [5. Modules](#5-modules)
  - [5.1 auth](#51-auth)
  - [5.2 tenants](#52-tenants)
  - [5.3 core](#53-core)
  - [5.4 projects](#54-projects)
  - [5.5 activities](#55-activities)
  - [5.6 ap](#56-ap)
  - [5.7 ar](#57-ar)
  - [5.8 accounting](#58-accounting)
  - [5.9 reports](#59-reports)
  - [5.10 catalog](#510-catalog)
- [6. Deferred add-ons](#6-deferred-add-ons)
- [7. Implementation roadmap](#7-implementation-roadmap)

## 1. Overview

NAP's core covers multi-tenant infrastructure, RBAC, master data, projects,
activities and cost management, accounts payable and receivable (AP/AR),
double-entry accounting, and cashflow/profitability reporting. Add-on modules
(starting with catalog) are licensed per tenant. Stack: Postgres 18, Express
5, React 19, Node 24, TypeScript throughout; schema-per-tenant via the owned
pg-schemata library; Redis as a fail-open cache.

Scope: this document covers architecture, schema locations, and table
inventories. Business rules — workflow behavior, numbering, approvals,
impersonation, cross-tenant access — belong to the per-module detailed
designs.

## 2. Architecture

### 2.1 Multi-tenant model

One Postgres database. A single `admin` schema holds system-wide tables
(tenant registry, portal users, cross-tenant bindings); every tenant gets its
own schema holding all business tables plus its own RBAC configuration. Tenant
provisioning creates the schema and runs the migrator; a tenant that is never
provisioned has no tables.

Schema resolution is per-request and happens in two places: the auth
middleware resolves the tenant from the user's bindings and writes the schema
name to the request context; the controller re-reads it on every call and
rebinds the model to that schema. Nothing uses `SET search_path`.

Cross-tenant membership lives in `admin.portal_user_tenants`, one row per
user–tenant pair. The active tenant is resolved from the binding table; the
resolution rule lives in ADR-0004. A root
tenant (`ROOT_TENANT_CODE`) exists for platform operations and cannot be
archived. Cross-tenant access and impersonation are tenants-module business
rules, out of scope here.

### 2.2 API layout

The application programming interface (API) in `apps/api/src` keeps the layer
order from architecture decision record (ADR) 0001; a layer imports only from
layers below it:

```
lib/         pure helpers — logger, cookies, hashing
db/          pg connection, redis client, module registry
services/    permission loading, cache invalidation, tenant provisioning
middleware/  passport strategies, rbac, entitlement, error handler
framework/   ReadController, WriteController, createRouter
modules/     feature modules
scripts/     maintenance, outside the runtime import graph
```

Modules are flat — `auth`, `tenants`, and `core` sit beside the business
modules. What distinguishes a module is data on its registry descriptor, not
folder position: schema scope (`admin` or `<tenant>`) and whether tenant
entitlement gates it. Every module has the same internal shape:

```
modules/<feature>/
├── apiRoutes/v1/
├── controllers/
├── models/
├── services/            # module-internal business logic
├── schema/migrations/
└── <feature>Repositories.ts
```

The uniform resource locator (URL) shape is `/api/<module>/v1/<resource>` —
the version segment belongs to the module, so modules version independently.
`auth` is the one exception and mounts flat at `/api/auth/*`. Adding a module
touches two hand-maintained registration points: `apiRoutes.ts` and the module
registry in `db/`.

`GET /health` stays mounted directly in `createApp()`, before auth and
entitlement, and never moves behind them.

### 2.3 Request flow

Middleware chain, in order: Cross-Origin Resource Sharing (CORS, with
credentials) → JavaScript Object Notation (JSON) and urlencoded body parsers →
cookie parser → request log → health check → auth (§3) → audit context
(AsyncLocalStorage, so pg-schemata stamps `created_by`/`updated_by` without
controllers threading the actor) → module routers → 404 → error handler.

`createRouter` is the route factory behind nearly every resource. It generates
13 standard routes (create, get, getWhere, archived, getById, update,
bulk-insert, bulk-update, archive, restore, import-xls, export-xls, ping),
each with a disable flag. Every route carries entitlement and RBAC
middleware; mutations additionally get audit-field injection. Custom routes
are declared before the factory so they match first.

Controllers extend a two-level base: `ReadController` (reads, export, RBAC
layers 2–4, error mapping) and `WriteController`, which extends
`ReadController` (mutations, bulk operations, import). Validation is the
pg-schemata schema definition plus targeted controller checks such as
status-transition maps.

Redis is an optimisation, never a dependency — every Redis path falls through
to Postgres on failure. It caches permission canons (900-second time to live
(TTL)), the per-user active tenant, and impersonation state.

### 2.4 Database conventions

Common columns on every table (via pg-schemata), stated once here and omitted
from the field lists in §5:

```
id              uuid          -- primary key, gen_random_uuid(), immutable
created_at      timestamptz
updated_at      timestamptz
created_by      uuid
updated_by      uuid
deactivated_at  timestamptz   -- soft delete
```

`tenant_id uuid` (or `tenant_code`) appears on top-level entities only.
Child and junction tables (units, tasks, cost items, invoice lines,
allocations, …) inherit isolation through foreign-key (FK) cascades to their
parent.

Conventions: tables plural `snake_case`; columns `snake_case`; every FK
declares `onDelete` and gets an index. Generated columns (`amount = quantity *
unit_cost`) are added by migration, outside the pg-schemata column set, so
they never appear in INSERT/UPDATE statements. Migrations are module-owned,
declared with an id and an `up()` function, ordered by a topological FK sort
across models, tracked per `(schema, module, migration)`, and guarded by
advisory locks.

## 3. Authentication

JSON Web Tokens (JWT, HS256) in httpOnly cookies. Passport local strategy
with bcrypt against `admin.portal_users`; no sessions, nothing in
localStorage, all client calls use `credentials: 'include'`.

Token claims are only `sub` (user id) and `ph` (SHA-256 of the resolved
permission canon). Tenant context, roles, and permissions are resolved on
every request by the auth middleware, never embedded in the token.

- **Login** — verify password, resolve the active tenant from the user's
  bindings in `admin.portal_user_tenants` (resolution rule in ADR-0004;
  bindings in inactive tenants are skipped, and login is refused only when no
  binding lands in an active tenant), load permissions (403 if none), compute
  `ph`, set `auth_token` (15 min) and `refresh_token` (7 days) cookies, prime
  the permission canon into Redis. The response carries the active binding
  list so the client can render a tenant picker. The active tenant is held
  server-side in its own per-user Redis key, never in the token.
- **Refresh** — `POST /api/auth/refresh` rotates both tokens. Logout clears
  both.
- **Staleness** — when a role or policy changes, the cached canon is
  invalidated; the next request reloads it from the database, and if the
  hash differs from the token's `ph` claim the response carries
  `X-Token-Stale: 1`, telling the client to refresh.
- **Impersonation** — audited in `admin.impersonation_logs`; the rules
  governing it are tenants-module business rules, out of scope here.

Endpoints: `POST /api/auth/login | refresh | logout | change-password |
switch-tenant`, `GET /api/auth/me | check`.

## 4. RBAC

Four layers. Layer 1 is route middleware; layers 2–4 run inside
`ReadController` for any controller that declares an RBAC config. The RBAC
configuration tables live in each tenant schema and belong to the core module
(§5.3).

1. **Policies.** Grants are `(module, router, action) → level`, with levels
   `none | view | update | full`: `none` = no access; `view` = read; `update`
   = read and update; `full` = read, update, create, and delete. Resolution
   cascades most- to least-specific:
   `module::router::action` → `module::router::` → `module::::` → `::::`.
   Entries in the policy catalog marked `policy_required` skip the cascade and
   demand an exact grant. There is no super-user bypass; every user resolves
   through roles and policies.
2. **Data scope.** Role scope is one of `all_projects > assigned_companies >
assigned_projects > self`, applied as row filters (`self` maps the
   `entity_id` on the user's active binding row in
   `admin.portal_user_tenants` to the resource's FK column; company scope
   derives project ids from memberships).
3. **State filters.** Per `(module, router)`, a role sees only listed
   statuses; an empty list means no filtering.
4. **Field groups.** Grants narrow the returned columns, on the query and
   again on the way out; no grants means all columns.

Multi-role merge: most permissive scope wins; states and columns union.

Roles are stored as a `text[]` directly on entity records (employees, clients,
vendor contacts) — no role-membership junction. System roles
(`platform_admin`, `tenant_admin`, `support`, `vendor_contact`, `client`) are
seeded, immutable, and
defined by a single wildcard policy; cross-tenant and impersonation grants
exist only in the root tenant.

Permission canons are cached in Redis at `perm:<userId>:<tenantCode>` for
900 s, invalidated on role/policy mutation, with the TTL as backstop.

Every route is RBAC-gated. Enforcement order: module entitlement (module
present in `admin.tenants.allowed_modules`) → resource annotation →
`rbac(required level)` → layers 2–4 in the controller. `createRouter` sets
the required level per route: reads and export require `view`; `update` and
`bulk-update` require `update`; `create`, `bulk-insert`, `import`, `archive`,
and `restore` require `full`.

## 5. Modules

Each module section states where its tables live (`admin` or `<tenant>`
schema) and which admin-schema tables the module interacts with. Field lists
show `field_name field_type`; common columns (§2.4) are omitted. Status
columns list their values inline.

### 5.1 auth

Identity and cross-tenant bindings. Not entitlement-gated.

Tables: `admin` schema.
Admin-schema interaction: owns the three tables below; reads `admin.tenants`
for tenant status at login.

**`admin.portal_users`** — global login identity, one row per person;
personally identifiable information (PII) lives on the tenant-schema entity
referenced by each binding row.

```
email          varchar(128)  -- login id, unique while active
password_hash  text          -- bcrypt, never returned
user_type      varchar(16)   -- employee | client | vendor_contact
status         varchar(20)   -- active | invited | locked
```

**`admin.portal_user_tenants`** — authoritative user–tenant binding; active
tenant resolution lives in ADR-0004.

```
portal_user_id  uuid          -- FK admin.portal_users
tenant_id       uuid          -- FK admin.tenants
user_type       varchar(16)   -- denormalized copy, composite FK below
entity_id       uuid          -- employee/client/vendor_contact row in that tenant
status          varchar(20)   -- active | invited | locked
last_used_at    timestamptz   -- default now()
```

Constraints:

- partial unique `(portal_user_id, tenant_id)` WHERE `deactivated_at IS NULL`
- partial unique `(tenant_id, entity_id)` WHERE `deactivated_at IS NULL`
- partial unique `(portal_user_id)` WHERE `deactivated_at IS NULL AND
user_type IN ('employee','client')`
- composite FK `(portal_user_id, user_type)` →
  `admin.portal_users (id, user_type)` — keeps the denormalized copy
  consistent so the index above stays local to this table

**`admin.impersonation_logs`** — audit of impersonation sessions.

```
impersonator_id     uuid
target_user_id      uuid
target_tenant_code  varchar(6)
reason              text
started_at          timestamptz
ended_at            timestamptz  -- null while active
```

### 5.2 tenants

Tenant registry and provisioning. Root-gated: accessible only to the NAP
platform_admin and provisioned NAP staff. Cross-tenant access and impersonation
are business rules of this module, out of scope here.

Tables: `admin` schema.
Admin-schema interaction: owns `admin.tenants`; manages rows in
`admin.portal_users` and `admin.portal_user_tenants` during provisioning and
user administration.

**`admin.tenants`** — tenant registry.

```
tenant_code      varchar(6)   -- unique short code
company          varchar(128)
schema_name      varchar(63)
status           varchar(20)  -- active | trial | suspended | pending
tier             varchar(20)  -- enterprise | growth | starter
region           varchar(64)
allowed_modules  jsonb        -- licensed add-ons; empty = none
max_users        integer
notes            text
```

### 5.3 core

Master data every other module reads — vendors, clients, employees, contacts,
companies, payment terms — plus the shared tenant configuration: RBAC,
approvals, numbering, preferences. Polymorphic children (addresses, phones,
emails, tax ids) attach to any entity through the `sources` discriminated
union.

Tables: `<tenant>` schema, except `admin.countries`.
Admin-schema interaction: owns `admin.countries` (reference data, FK target
for every `country_code`).

**`sources`** — one row per entity that owns polymorphic children.

```
table_id     uuid         -- parent entity id
source_type  varchar(32)  -- vendor | vendor_contact | client | employee | contact | company
label        varchar(64)
```

**`vendors`** — vendor master.

```
source_id        uuid         -- FK sources
name             varchar(128)
code             varchar(16)  -- unique per tenant, auto-numbered
payment_term_id  uuid         -- FK payment_terms
is_active        boolean
notes            text
```

**`vendor_contacts`** — people at a vendor; may hold roles and log in.

```
vendor_id   uuid  -- FK vendors
source_id   uuid  -- FK sources
first_name  varchar(64)
last_name   varchar(64)
position    varchar(64)
department  varchar(64)
is_app_user boolean
roles       text[]
is_primary  boolean
```

**`clients`** — customer master; email lives in `emails`.

```
source_id    uuid         -- FK sources
name         varchar(128)
code         varchar(16)  -- unique per tenant, auto-numbered
roles        text[]
is_app_user  boolean
is_active    boolean
```

**`employees`** — internal staff.

```
source_id           uuid  -- FK sources
first_name          varchar(64)
last_name           varchar(64)
code                varchar(16)
position            varchar(64)
department          varchar(64)
roles               text[]
is_app_user         boolean
is_primary_contact  boolean
is_billing_contact  boolean
```

**`contacts`** — standalone payees and receivable counterparties (one-off
commissions, donations); cannot log in.

```
source_id  uuid  -- FK sources
name       varchar(128)
code       varchar(16)
is_active  boolean
```

**`companies`** — legal entities under a tenant; sign contracts, hold bank
accounts, scope invoice numbering.

```
source_id  uuid         -- FK sources
code       varchar(16)  -- required, unique per tenant, not auto-numbered
name       varchar(128)
is_active  boolean
```

**`company_members`** — user–company membership (RBAC layer 2 scope).

```
company_id  uuid  -- FK companies
user_id     uuid  -- FK admin.portal_users
```

**`payment_terms`** — net-terms definitions.

```
label      varchar(64)
term       integer      -- default 30
units      varchar(16)  -- days | months
is_active  boolean
```

**`addresses`** — polymorphic addresses.

```
source_id       uuid  -- FK sources
label           varchar(32)  -- billing | physical | mailing
address_line_1  varchar(255)
address_line_2  varchar(255)
address_line_3  varchar(255)
city            varchar(128)
state_province  varchar(128)
postal_code     varchar(20)
country_code    char(2)  -- FK admin.countries
is_primary      boolean
```

**`phone_numbers`** — polymorphic phones.

```
source_id     uuid  -- FK sources
phone_type    varchar(16)  -- cell | work | home | fax | other
country_code  char(2)
phone_number  varchar(32)
is_primary    boolean
```

**`emails`** — canonical email store across all source types; the login email
is flagged here.

```
source_id   uuid  -- FK sources
email       varchar(128)  -- unique per tenant while active
label       varchar(32)
is_primary  boolean
is_login    boolean
```

**`tax_identifiers`** — polymorphic tax ids.

```
source_id     uuid  -- FK sources
country_code  char(2)
tax_type      varchar(16)  -- EIN | SSN | VAT | ...
tax_value     varchar(64)
is_primary    boolean
```

**`admin.countries`** — ISO 3166-1 reference; FK target for every
`country_code`. No API of its own.

```
code         char(2)  -- primary key
name         varchar(128)
dial_code    varchar(8)
placeholder  varchar(64)
```

RBAC configuration (§4):

**`roles`** — role definitions; scope drives RBAC layer 2.

```
code          varchar(32)
name          varchar(64)
description   text
is_system     boolean
is_immutable  boolean
scope         varchar(32)  -- all_projects | assigned_companies | assigned_projects | self
tenant_code   varchar(6)
```

**`policies`** — per-role grants (RBAC layer 1).

```
role_id      uuid         -- FK roles
module       varchar(32)  -- '' = wildcard
router       varchar(64)
action       varchar(32)
level        varchar(8)   -- none | view | update | full
tenant_code  varchar(6)
```

**`policy_catalog`** — read-only registry of valid `(module, router, action)`
triples for role configuration. Seed data; no audit columns.

```
module            varchar(32)
router            varchar(64)
action            varchar(32)
label             varchar(128)
description       varchar(512)
sort_order        integer
valid_statuses    text[]
available_fields  text[]
policy_required   boolean  -- exact grant required, no cascade
```

**`state_filters`** — per-role visible statuses (RBAC layer 3).

```
role_id           uuid  -- FK roles
module            varchar(32)
router            varchar(64)
visible_statuses  text[]  -- empty = no filtering
```

**`field_group_definitions`** — named column sets (RBAC layer 4).

```
module      varchar(32)
router      varchar(64)
group_name  varchar(64)
columns     text[]
is_default  boolean  -- granted to every role automatically
```

**`field_group_grants`** — role → field-group grants; none = all columns.

```
role_id         uuid  -- FK roles
field_group_id  uuid  -- FK field_group_definitions
```

Shared configuration:

**`approvals`** — append-only log of workflow state transitions, polymorphic
across modules.

```
entity_type   varchar(32)  -- project | unit | change_order | ap_invoice | ...
entity_id     uuid         -- polymorphic, no FK
action        varchar(32)  -- submit | approve | reject | post | complete | release | close
prior_status  varchar(20)
new_status    varchar(20)
reason        text
```

**`tenant_approval_config`** — per-workflow approval requirement setting.

```
workflow_type     varchar(32)  -- unique per tenant
require_approval  boolean
```

**`tenant_numbering_config`** — display-id format per id type.

```
tenant_id   uuid
id_type     varchar(32)  -- employee | vendor | client | contact | ar_invoice | ap_invoice | project
prefix      varchar(16)
suffix      varchar(16)
date_mode   varchar(16)  -- none | year | year_month | ymd
reset_mode  varchar(16)  -- never | yearly | monthly | daily
padding     integer
separator   varchar(4)
uppercase   boolean
scope_type  varchar(32)  -- none | company | project
is_enabled  boolean
```

**`tenant_number_sequence_state`** — serial counters, one per
`(id_type, scope, period)`.

```
tenant_id    uuid
id_type      varchar(32)
scope_id     uuid         -- scope entity, or nil uuid for global
period_key   varchar(16)  -- 'global' | YYYY | YYYY-MM | YYYY-MM-DD
last_serial  bigint
```

**`tenant_preferences`** — one row per tenant, user-interface (UI) and
behavior preferences.

```
tenant_id          uuid     -- unique
default_page_size  integer  -- default 25
```

### 5.4 projects

Project lifecycle: projects, units (deliverable structures), tasks, cost
items (estimate), change orders, and reusable templates. Every cost, AP, AR,
and general ledger (GL) line elsewhere rolls up to a project here.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`projects`** — top-level project record.

```
company_id       uuid  -- FK companies
address_id       uuid  -- FK addresses
project_code     varchar(32)  -- unique per tenant, auto-numbered
name             varchar(255)
description      text
notes            text
status           varchar(20)  -- planning | budgeting | released | complete | on_hold
contract_amount  numeric(14,2)
```

**`project_clients`** — many clients per project.

```
project_id  uuid  -- FK projects
client_id   uuid  -- FK clients
role        varchar(32)  -- buyer | co-buyer | guarantor
is_primary  boolean
```

**`project_members`** — user–project membership (RBAC layer 2 scope).

```
project_id  uuid  -- FK projects
user_id     uuid  -- FK admin.portal_users
role        varchar(32)  -- label only: member, lead
```

**`units`** — deliverable units under a project; each owns its own task tree
and cost items.

```
project_id        uuid  -- FK projects
template_unit_id  uuid  -- FK template_units
version_used      integer
name              varchar(128)
unit_code         varchar(32)  -- unique per project
status            varchar(20)  -- draft | released | complete
```

**`task_groups`** — tenant-level grouping of task definitions.

```
code        varchar(16)  -- unique per tenant
name        varchar(64)
description text
sort_order  integer
```

**`tasks_master`** — tenant-level library of task definitions.

```
code                   varchar(16)  -- unique per tenant
task_group_code        varchar(16)  -- composite FK to task_groups
name                   varchar(128)
default_duration_days  integer
```

**`tasks`** — unit-level task instances; diverge from master after creation.

```
unit_id         uuid  -- FK units
task_code       varchar(16)
name            varchar(128)
duration_days   integer
status          varchar(20)  -- pending | in_progress | complete | on_hold
parent_task_id  uuid  -- self-reference
```

**`cost_items`** — estimate lines under a task.

```
task_id      uuid  -- FK tasks
item_code    varchar(16)
description  varchar(255)
cost_class   varchar(16)  -- labor | material | subcontract | equipment | other
cost_source  varchar(16)  -- budget | change_order
quantity     numeric(12,4)
unit_cost    numeric(12,4)
amount       numeric(12,2)  -- generated: quantity * unit_cost
```

**`change_orders`** — scope adjustments against a unit; actors recorded in
`approvals`.

```
unit_id       uuid  -- FK units
co_number     varchar(16)
title         varchar(128)
reason        text
status        varchar(20)  -- draft | submitted | approved | rejected | posted | closed
total_amount  numeric(12,2)
submitted_by  uuid
submitted_at  timestamptz
posted_by     uuid
posted_at     timestamptz
```

**Templates** — blueprints instantiated into units: `template_units` (name,
version, status), `template_tasks` (task_code, name, duration_days,
parent_code), `template_cost_items` (cost class/source, quantity, unit_cost,
generated amount), `template_change_orders`.

### 5.5 activities

Categorical cost tracking. Categories and activities classify work;
deliverables and assignments scope it; budgets allocate per
`(deliverable, activity)`; cost lines are planned spend; actual costs are
incurred spend.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`categories`** — top-level cost classification.

```
code  varchar(16)
name  varchar(64)
type  varchar(16)  -- labor | material | subcontract | equipment | other
```

**`activities`** — activity codes under a category.

```
category_id  uuid  -- FK categories
code         varchar(16)
name         varchar(64)
is_active    boolean
```

**`deliverables`** — units of work whose completion triggers billing,
payment, or a gate.

```
name         varchar(128)
description  text
effect       varchar(16)  -- bill | pay | gate
status       varchar(20)  -- pending | released | finished | canceled
start_date   date
end_date     date
```

**`deliverable_assignments`** — scopes a deliverable to a project and
employee.

```
deliverable_id  uuid  -- FK deliverables
project_id      uuid  -- FK projects
employee_id     uuid  -- FK employees
notes           text
```

**`budgets`** — versioned budget per `(deliverable, activity)`.

```
deliverable_id   uuid  -- FK deliverables
activity_id      uuid  -- FK activities
budgeted_amount  numeric(12,2)
version          integer
is_current       boolean
status           varchar(20)  -- draft | submitted | approved | locked | rejected
submitted_by     uuid
submitted_at     timestamptz
approved_by      uuid
approved_at      timestamptz
```

**`cost_lines`** — planned spend lines.

```
company_id      uuid  -- FK companies
deliverable_id  uuid  -- FK deliverables
vendor_id       uuid  -- FK vendors
activity_id     uuid  -- FK activities
budget_id       uuid  -- FK budgets
tenant_sku      varchar(64)
source_type     varchar(16)  -- material | labor
quantity        numeric(12,4)
unit_price      numeric(12,4)
amount          numeric(12,2)  -- generated: quantity * unit_price
markup_pct      numeric(5,2)
status          varchar(20)  -- draft | locked | change_order
```

**`actual_costs`** — incurred cost.

```
activity_id      uuid  -- FK activities
project_id       uuid  -- FK projects
amount           numeric(12,2)
currency         varchar(3)
reference        text
approval_status  varchar(20)  -- pending | approved | rejected
incurred_on      date
```

**`vendor_parts`** — local per-vendor pricing cache, available without the
catalog add-on.

```
vendor_id   uuid  -- FK vendors
vendor_sku  varchar(64)
tenant_sku  varchar(64)
unit_cost   numeric(12,4)
currency    varchar(3)
markup_pct  numeric(5,2)
is_active   boolean
```

### 5.6 ap

Accounts payable: vendor invoices, payments and allocations, credit memos.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`ap_invoices`** — vendor invoice header.

```
company_id      uuid  -- FK companies
vendor_id       uuid  -- FK vendors
project_id      uuid  -- FK projects
invoice_number  varchar(64)  -- auto-numbered
invoice_date    date
due_date        date
total_amount    numeric(14,2)
currency        varchar(3)
status          varchar(20)  -- open | approved | paid | voided
notes           text
```

**`ap_invoice_lines`** — distribution lines.

```
invoice_id    uuid  -- FK ap_invoices
cost_line_id  uuid  -- FK cost_lines
activity_id   uuid  -- FK activities
account_id    uuid  -- FK chart_of_accounts
description   text
amount        numeric(12,2)
```

**`payments`** — vendor payments.

```
vendor_id      uuid  -- FK vendors
ap_invoice_id  uuid  -- FK ap_invoices, convenience for the one-invoice case
payment_date   date
amount         numeric(14,2)
method         varchar(24)  -- check | ach | wire
reference      varchar(64)
notes          text
```

**`payment_allocations`** — splits a payment across invoices.

```
payment_id     uuid  -- FK payments
ap_invoice_id  uuid  -- FK ap_invoices
amount         numeric(14,2)
```

**`ap_credit_memos`** — vendor credits.

```
vendor_id      uuid  -- FK vendors
ap_invoice_id  uuid  -- FK ap_invoices
credit_number  varchar(64)
credit_date    date
amount         numeric(14,2)
reason         text
status         varchar(20)  -- open | applied | voided
```

### 5.7 ar

Accounts receivable: client invoices, receipts and allocations, billing
agreements.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`ar_invoices`** — client invoice header.

```
company_id            uuid  -- FK companies
client_id             uuid  -- FK clients
project_id            uuid  -- FK projects
deliverable_id        uuid  -- FK deliverables
billing_agreement_id  uuid  -- FK billing_agreements
invoice_number        varchar(32)  -- auto-numbered
invoice_date          date
due_date              date
total_amount          numeric(14,2)
currency              varchar(3)
status                varchar(20)  -- open | sent | paid | voided
notes                 text
```

**`ar_invoice_lines`** — revenue distribution lines.

```
invoice_id   uuid  -- FK ar_invoices
account_id   uuid  -- FK chart_of_accounts
description  text
amount       numeric(14,2)
```

**`receipts`** — client cash received.

```
client_id      uuid  -- FK clients
ar_invoice_id  uuid  -- FK ar_invoices
receipt_date   date
amount         numeric(14,2)
method         varchar(24)  -- check | ach | wire
reference      varchar(64)
notes          text
```

**`receipt_allocations`** — splits a receipt across invoices.

```
receipt_id     uuid  -- FK receipts
ar_invoice_id  uuid  -- FK ar_invoices
amount         numeric(14,2)
```

**`billing_agreements`** — the revenue-side contract; single home for
services statements of work (SOWs) and construction draw schedules.

```
company_id      uuid  -- FK companies
client_id       uuid  -- FK clients
project_id      uuid  -- FK projects
name            varchar(128)
agreement_type  varchar(24)  -- sow | draw_schedule | other
total_amount    numeric(14,2)
status          varchar(20)  -- draft | active | closed
notes           text
```

**`billing_agreement_milestones`** — links an agreement to bill-effect
deliverables.

```
billing_agreement_id  uuid  -- FK billing_agreements
deliverable_id        uuid  -- FK deliverables
sequence              integer
```

### 5.8 accounting

Chart of accounts, journal entries, ledger balances, a posting queue and
posting rules, fiscal periods, and intercompany.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`ledgers`** — one ledger per accounting representation per company.

```
company_id  uuid  -- FK companies
code        varchar(16)  -- unique per company
name        varchar(64)
basis       varchar(16)  -- accrual | cash | common
is_default  boolean
status      varchar(16)  -- active | archived
```

**`company_accounting_config`** — per-company book basis and recognition
policies; one row per company.

```
company_id                  uuid  -- FK companies, unique
book_basis                  varchar(16)  -- accrual | cash
revenue_recognition_policy  varchar(24)  -- on_invoice | percent_complete | completed_contract
wip_policy                  varchar(24)  -- expense_immediately | capitalize_release
```

**`chart_of_accounts`** — GL account master.

```
code                 varchar(16)
name                 varchar(64)
type                 varchar(16)  -- asset | liability | equity | income | expense | cash | bank
is_active            boolean
bank_account_number  varchar(32)
routing_number       varchar(16)
bank_name            varchar(64)
```

**`journal_entries`** — GL entry header, scoped to one ledger.

```
company_id   uuid  -- FK companies
ledger_id    uuid  -- FK ledgers, not null
project_id   uuid  -- FK projects
entry_date   date
description  text
status       varchar(16)  -- pending | posted | reversed
source_type  varchar(32)  -- activity_actual | invoice | payment | ...
source_id    uuid
corrects_id  uuid  -- self-reference, reversals
```

**`journal_entry_lines`** — debit/credit legs.

```
entry_id       uuid  -- FK journal_entries
account_id     uuid  -- FK chart_of_accounts
debit          numeric(12,2)
credit         numeric(12,2)
memo           text
related_table  varchar(32)
related_id     uuid
```

**`ledger_balances`** — append-only per-ledger account balances.

```
ledger_id   uuid  -- FK ledgers
account_id  uuid  -- FK chart_of_accounts
as_of_date  date
balance     numeric(14,2)
```

**`posting_queues`** — serialization point for cross-module posting.

```
journal_entry_id  uuid  -- FK journal_entries
status            varchar(16)  -- pending | posted | failed
error_message     text
processed_at      timestamptz
```

**`posting_rules`** — per-ledger posting rules; a null account role means the
event posts nothing on that ledger.

```
ledger_id            uuid  -- FK ledgers
event_type           varchar(32)  -- ap_invoice | ap_payment | ar_invoice | ar_receipt | actual_cost | wip_release | ...
debit_account_role   varchar(32)  -- expense | wip | ar_receivable | cash | cogs | ...
credit_account_role  varchar(32)  -- revenue | ap_liability | accrual | cash | wip | ...
recognition_date     varchar(16)  -- invoice_date | payment_date | incurred_on
valid_from           date
valid_to             date
```

**`category_account_map`** — resolves `(category, date)` to a GL account.

```
category_id  uuid  -- FK categories
account_id   uuid  -- FK chart_of_accounts
valid_from   date
valid_to     date
```

**`company_accounts`** — intercompany due-to/due-from account pairs.

```
source_company_id         uuid  -- FK companies
target_company_id         uuid  -- FK companies
inter_company_account_id  uuid  -- FK chart_of_accounts
is_active                 boolean
```

**`company_transactions`** — paired intercompany transactions with an
elimination flag.

```
source_company_id        uuid  -- FK companies
target_company_id        uuid  -- FK companies
source_journal_entry_id  uuid  -- FK journal_entries
target_journal_entry_id  uuid  -- FK journal_entries
module                   varchar(32)  -- ar | ap | je
amount                   numeric(14,2)
status                   varchar(16)  -- pending | posted | reversed
is_eliminated            boolean
description              text
```

**`internal_transfers`** — account-to-account cash transfers.

```
from_account_id  uuid  -- FK chart_of_accounts
to_account_id    uuid  -- FK chart_of_accounts
transfer_date    date
amount           numeric(12,2)
description      text
```

**`fiscal_periods`** — per-ledger accounting periods; date ranges must not
overlap within a ledger.

```
company_id     uuid  -- FK companies
ledger_id      uuid  -- FK ledgers
fiscal_year    integer
period_number  integer
name           varchar(32)
start_date     date
end_date       date
status         varchar(16)  -- open | closed | locked
closed_at      timestamptz
locked_at      timestamptz
```

### 5.9 reports

Read-only layer covering cashflow, profitability, aging, and exports. Owns no
tables — everything is a Structured Query Language (SQL) view created per
tenant schema at provisioning and computed at request time, joining the
transactional tables on `project_id`. Basis-aware (accrual default, cash
optional).

Tables: none; views in the `<tenant>` schema.
Admin-schema interaction: none.

- `vw_project_profitability` — per-project rollup: contract value, invoiced
  and collected revenue, budgeted/committed/actual cost, gross profit and
  margin, projected cost at completion.
- `vw_project_cashflow_monthly` — monthly inflow/outflow time series with
  cumulative net cashflow.
- `vw_project_cost_by_category` — cost breakdown by activity category per
  project.
- `vw_ar_aging` — receivable aging buckets per client (current, 1–30, 31–60,
  61–90, over 90).
- `vw_ap_aging` — payable aging buckets per vendor, same buckets.
- Export views — flattened contacts, addresses, and template data for
  spreadsheet export.

### 5.10 catalog

Add-on, licensed via `admin.tenants.allowed_modules`. Master item catalog,
bill-of-materials (BOM) assemblies, vendor stock-keeping-unit (SKU) matching
by embedding similarity (pgvector), and time-phased vendor pricing. Cost
lines reference `(vendor, vendor_sku)` as a soft reference — no FK, because
catalog tables don't exist for unlicensed tenants.

Tables: `<tenant>` schema.
Admin-schema interaction: none.

**`catalog_items`** — tenant-curated material master.

```
catalog_sku             varchar(64)  -- unique
description             text
description_normalized  text
category                varchar(64)
sub_category            varchar(64)
model                   varchar(32)
embedding               vector(3072)
```

**`bom_components`** — self-referencing assembly edges on `catalog_items`;
an assembly is an item that owns rows, a leaf owns none.

```
parent_item_id  uuid  -- FK catalog_items
child_item_id   uuid  -- FK catalog_items
quantity        numeric(12,4)
```

**`vendor_skus`** — vendor price-list SKUs matched to catalog items.

```
vendor_id               uuid  -- FK vendors
vendor_sku              varchar(64)
description             text
description_normalized  text
catalog_sku_id          uuid  -- FK catalog_items
confidence              real  -- 0.0–1.0 match confidence
model                   varchar(32)  -- embedding model id
embedding               vector(3072)
```

**`vendor_pricing`** — time-phased pricing per vendor SKU.

```
vendor_sku_id   uuid  -- FK vendor_skus
unit_price      numeric(12,4)
unit            varchar(32)
effective_date  date
```

**`match_review_logs`** — audit trail for SKU-matching decisions.

```
entity_type  varchar(32)
entity_id    uuid
match_type   varchar(32)
match_id     uuid
reviewer_id  uuid
decision     varchar(16)  -- accept | reject | defer
notes        text
```

A read-only BOM-explosion endpoint rolls up assembly cost.

## 6. Deferred add-ons

Each gates on `admin.tenants.allowed_modules`; schemas will be designed when
the module is taken up.

- **scheduling** — resource, crew, and milestone scheduling over project
  tasks.
- **construction** (vertical) — subdivision-unit sales, closing statements,
  draw schedules, lien-waiver tracking.
- **timesheets** — labor capture by employee/project/activity.
- **procurement** — purchase orders, vendor requests for quote (RFQs),
  expediting.
- **inventory** — on-hand stock, lot/serial tracking, project issues.
- **manufacturing** (vertical) — production work orders, BOM-driven
  production.

## 7. Implementation roadmap

Dependency-ordered. Each step is preceded by its detailed design doc and
proven by a vertical slice before the next starts.

1. **Platform foundation.** pg-schemata integration, module registry,
   migrator. The admin-schema bootstrap creates `admin.tenants`,
   `admin.portal_users`, `admin.portal_user_tenants`,
   `admin.impersonation_logs`, and `admin.countries`. Tenant provisioning
   ships as a service plus a command-line interface (CLI) script, and
   registers the tenant-schema migrations login depends on: the six RBAC
   configuration tables (`roles`, `policies`, `policy_catalog`,
   `state_filters`, `field_group_definitions`, `field_group_grants`) plus
   `sources` and `employees`. Seed scripts create the root tenant, provision
   its schema, seed the policy catalog and system roles, and create an admin
   employee linked to a platform_admin portal user with its tenant binding — the
   complete fixture set for testing login end-to-end.
2. **auth.** Login, refresh, logout, and me over JWT cookies, plus the
   minimal permission-canon loader (login rejects users with no
   permissions). Tested in-process with supertest against the step 1 seeds.
3. **Framework and RBAC enforcement.** `createRouter`,
   `ReadController`/`WriteController`, entitlement and `rbac()` middleware,
   with all four levels enforced on every route. Built before any business
   module so no route ever ships ungated.
4. **tenants.** Root-gated HTTP surface over the step 1 provisioning service
   and `admin.tenants`.
5. **core.** Remaining master data plus the shared services (numbering,
   approvals, preferences). First real web slice: vendors end-to-end,
   replacing mock data.
6. **projects**, then **activities** — in that order; activities reference
   projects and companies.
7. **accounting.** Before AP/AR — both post to the GL, and building them
   first means retrofitting posting into finished modules.
8. **ap** and **ar.** Parallelizable once the posting contract exists.
9. **reports.** Views last; they join everything.
10. **catalog.** First add-on; proves the entitlement machinery on a module
    that can be switched off.

Demo-tenant seeds grow with each step and double as test fixtures. The web
app converts from mock data to the live API one module at a time rather than
in a final big-bang integration.
