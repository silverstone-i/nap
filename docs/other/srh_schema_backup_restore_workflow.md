# SRH Schema Rebuild & Restore Workflow

## Goal

Automate a full database rebuild that:

1. Backs up the `srh` schema and its `admin.nap_users` entries
2. Drops all schemas and rebuilds the database from scratch
3. Re-provisions the SRH tenant with fresh seed data (RBAC, policy catalog, numbering)
4. Restores business data from the backup
5. Preserves user passwords

## Why rebuild from scratch?

A simple backup/restore into an existing database can leave stale seed data.
In particular, `policy_catalog` entries may lack `valid_statuses` and
`available_fields` arrays that are only populated by `policyCatalogSeeder.js`
during provisioning. This causes:

- Status dropdown in "add state filter" to not populate
- Field group column options to not appear in the create dialog

Rebuilding from scratch ensures the database matches the current codebase.

---

## One-command execution

```bash
bash scripts/db/rebuild_and_restore_srh.sh
```

Run from the monorepo root. Requires `.pgpass` or `PGPASSWORD` for `nap_admin`.

---

## What the script does

### Step 1 — Backup

- `pg_dump -Fc --schema=srh` — archival custom dump (timestamped)
- `pg_dump --schema=srh` — plain SQL dump (used for staging restore)
- `\COPY` admin.nap_users rows for SRH tenant to CSV (preserves `password_hash`)

All files written to `tmp/srh_backups/`.

### Step 2 — Drop all schemas

Queries `information_schema.schemata` for every non-system schema and drops them
with `CASCADE`. This removes `admin`, `nap`, `srh`, `pgschemata`, `public`, etc.

### Step 3 — Recreate public schema

`CREATE SCHEMA IF NOT EXISTS public`

### Step 4 — Run setupAdmin

Runs `setupAdmin.js` which:

- Creates the `admin` schema and runs admin-scope migrations
- Provisions the NapSoft root tenant (`nap` schema)
- Seeds the root super user

### Step 5 — Provision SRH tenant

Runs `provisionTenantCli.js` which:

- Inserts the SRH tenant record into `admin.tenants`
- Calls `provisionTenant()` — creates `srh` schema, runs all tenant-scope
  migrations, seeds system roles, **fresh `policy_catalog`** (with
  `valid_statuses` and `available_fields`), and numbering config

### Step 6 — Restore from backup

1. **Rewrite** plain SQL dump: `srh` → `srh_restore` (perl regex on schema refs)
2. **Restore** rewritten SQL into `srh_restore` staging schema
3. **Remap** `tenant_id` and `tenant_code` in all staged tables (dynamic DO block)
4. **Generate FK-safe order** from FK metadata via recursive CTE
5. **Truncate** `srh` tables in reverse FK order, **excluding `policy_catalog`**
6. **Insert** from `srh_restore` to `srh` in FK order, **excluding `policy_catalog`**

Excluding `policy_catalog` preserves the freshly-seeded data from Step 5.

### Step 7 — Restore nap_users

Loads the CSV backup into a temp table, remaps `tenant_id` to the new SRH
tenant UUID, and inserts into `admin.nap_users` with new UUIDs but original
`password_hash` values. Skips emails that already exist.

### Step 8 — Validate

Runs integrity checks:

| Check | Expected |
|-------|----------|
| Employees missing tenant reference | 0 |
| App-user employees missing nap_users | 0 |
| nap_users pointing to missing employee | 0 |
| policy_catalog total entries | > 0 |
| policy_catalog with valid_statuses | > 0 |
| policy_catalog with available_fields | > 0 |

### Step 9 — Clean up

Drops the `srh_restore` staging schema.

---

## Supporting scripts

### `scripts/db/provisionTenantCli.js`

CLI script to provision any tenant from the command line.

```bash
cross-env NODE_ENV=development node scripts/db/provisionTenantCli.js \
  --tenant-code SRH \
  --company "Sterling Ridge Homes, LLC" \
  --schema-name srh \
  --tier growth
```

Inserts tenant record (idempotent) and calls `provisionTenant()`.

### `scripts/db/reseedPolicyCatalog.js`

Standalone utility to truncate and reseed `policy_catalog` for any schema.
Useful after code changes to `policyCatalogSeeder.js` without re-provisioning.

```bash
cross-env NODE_ENV=development node scripts/db/reseedPolicyCatalog.js --schema srh
cross-env NODE_ENV=development node scripts/db/reseedPolicyCatalog.js --schema nap --napsoft
```

---

## Design decisions

1. **Exclude only `policy_catalog`** from the restore — all other tables
   (roles, policies, numbering_config) are restored from backup since they
   contain user-customized data.

2. **Preserve passwords** by backing up `admin.nap_users` to CSV before
   dropping. Employee UUIDs are stable across backup/restore, so `entity_id`
   links remain valid.

3. **`nap_users.id` is regenerated** (`gen_random_uuid()`) to avoid PK
   conflicts. Users get new session tokens on next login but keep passwords.

4. **FK-safe ordering** is generated from PostgreSQL metadata (recursive CTE
   over `information_schema.table_constraints`), not hard-coded.

5. **Self-referential FKs** are excluded from the walk CTE
   (`e.child_table <> e.parent_table`) with a depth limit of 50 as a safety
   valve against cycles.

---

## Prerequisites

- `.pgpass` configured for `nap_admin` on `nap_dev` (or `PGPASSWORD` set)
- Node >= 20, npm workspace dependencies installed
- Run from the monorepo root

---

## Files produced

| File | Purpose |
|------|---------|
| `tmp/srh_backups/srh_schema_TIMESTAMP.dump` | Archival custom dump |
| `tmp/srh_backups/srh_schema.sql` | Plain SQL dump for staging |
| `tmp/srh_backups/nap_users_srh.csv` | nap_users backup with password hashes |
| `tmp/srh_backups/srh_restore_schema_safe.sql` | Rewritten SQL for staging |
| `tmp/srh_backups/truncate_srh.sql` | Generated truncate statements |
| `tmp/srh_backups/insert_srh.sql` | Generated insert statements |
| `tmp/srh_backups/restore_transaction.sql` | Combined truncate + insert |

---

## Operational notes

- `admin.nap_users.entity_id` is the employee link field, not `employee_id`
- App-user filtering uses `is_app_user = true`
- Schema rewrite only touches executable schema references (not data values)
- Tenant remap is dynamic across all staged tables with `tenant_id`/`tenant_code`
- The custom dump file is kept unchanged as an archival safety net
