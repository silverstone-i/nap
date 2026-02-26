/**
 * @file Tenant management business rules
 * @module docs/rules
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# Tenant Management Rules

## Tenant Provisioning Flow

Creating a tenant is a three-step atomic operation:

1. **Insert tenant record** in `admin.tenants`
2. **Provision schema** — creates a PostgreSQL schema, runs tenant-scope
   migrations, seeds system RBAC roles (`admin`, `manager`, `viewer`),
   and seeds `tenant_numbering_config` rows (all `is_enabled = false`)
3. **Create admin user** — inserts an `employees` record with
   `roles: ['admin']` and `is_app_user: true`, then a linked `nap_user`
   with the provided email and password. The admin employee starts with
   `code = NULL`; numbering is configured and backfilled later via
   Settings (see PRD §3.13.9)

If provisioning fails (step 2), the tenant record is soft-deleted as
rollback. The caller receives a 500 with the provisioning error.

### Reserved Schema Names

The following schema names are rejected during provisioning:

- `admin` — admin schema
- `public` — PostgreSQL default schema
- `pg_catalog`, `information_schema` — system schemas

Schema names are derived from `tenant_code` (lowercased, underscored).

## Root Tenant Protection

The root NapSoft tenant (code `NAP`) has special protections:

- **Cannot be archived** — archive requests return `403 Forbidden`
- **Cannot be deleted** — there is no hard-delete endpoint
- The bootstrap super user (created during admin setup) is identified by
  `entity_type IS NULL` and belongs to the root tenant

## User Registration Prerequisites

Before a user can be registered:

1. A valid `tenant_id` must be provided (or resolved from `tenant_code`)
2. The target tenant must be **active** (`deactivated_at IS NULL`)
3. The email must be unique across all `nap_users` (active and archived)

Registration creates a `nap_user` with `status: 'active'`. The user can
log in immediately after registration.

## Archive / Restore Cascade Rules

### Archiving a Tenant

When a tenant is archived:

- All **active** `nap_users` belonging to that tenant are deactivated
  (their `deactivated_at` is set to `NOW()`)
- Archived users cannot log in (login checks `deactivated_at IS NULL`)
- The tenant's PostgreSQL schema is **not** dropped — data is preserved

### Restoring a Tenant

When a tenant is restored:

- Only the tenant record is reactivated (`deactivated_at = NULL`)
- Users are **not** automatically restored — each user must be
  individually restored by an admin
- This prevents accidentally re-enabling accounts that were intentionally
  deactivated before the tenant was archived

### Archiving a User

- Users **cannot archive themselves** — self-archival returns `403`
- The bootstrap super user cannot be archived (identified by
  `entity_type IS NULL` on the root tenant)
- Archived users are immediately unable to log in

### Restoring a User

- The parent tenant must be **active** before a user can be restored
- If the tenant is archived, restore returns an error directing the admin
  to restore the tenant first

## Cross-Tenant Access (Assumed Tenant)

NapSoft users (those belonging to the `NAP` tenant) can assume the
context of another tenant:

- The `x-tenant-code` header on API requests switches the active tenant
- `authRedis` middleware resolves the target tenant and attaches it to
  `req.user`
- On the client, `AuthContext.assumeTenant()` sets the header for all
  subsequent requests
- `exitAssumption()` returns to the user's home tenant

## Impersonation

NapSoft admins can impersonate other users for support and debugging:

### Starting Impersonation

1. Admin selects a target tenant and user
2. Server creates a Redis key `imp:{adminUserId}` storing the target
   user ID and impersonation log ID
3. An audit record is inserted into `admin.impersonation_logs`
4. **Concurrent impersonation is rejected** — if `imp:{userId}` already
   exists, the request returns `409 Conflict`

### During Impersonation

- `authRedis` middleware checks `imp:{userId}` after user hydration
- If active: swaps `req.user` to the target user, sets
  `req.user.is_impersonating = true` and
  `req.user.impersonated_by = originalUserId`
- Permissions are reloaded for the target user
- The client displays an amber `ImpersonationBanner` with the target
  user's email

### Ending Impersonation

1. Redis key `imp:{userId}` is deleted
2. Audit log `ended_at` is set to `NOW()`
3. The admin returns to their own user context

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ROOT_TENANT_CODE` | No | `NAP` | Root tenant identifier |
| `ROOT_COMPANY` | No | `NapSoft LLC` | Root tenant company name |
| `ROOT_EMAIL` | Yes | — | Bootstrap admin email |
| `ROOT_PASSWORD` | Yes | — | Bootstrap admin password |
