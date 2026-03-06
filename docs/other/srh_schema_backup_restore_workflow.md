# PostgreSQL Single-Schema Backup and Restore Workflow (`srh` -> `srh_restore` -> `srh`)

## Goal

Backup the `srh` schema from the multi-schema PostgreSQL database `nap_dev`, restore it into a staging schema named `srh_restore`, remap cross-schema IDs against the live `admin` schema, and then load the remapped data back into the live `srh` schema.

## Assumptions

- Database name: `nap_dev`
- Login role: `nap_admin`
- Source schema to back up: `srh`
- Live reference schema already present in target DB: `admin`
- Staging schema to use during restore/remap: `srh_restore`
- You will work from a single interactive `psql` session where practical
- Matching/remap keys exist, such as:
  - tenant: `code`, `slug`, or another stable unique business key
  - employee/user: `email`, `code`, or another stable unique business key

## Important constraint

A custom-format dump created with `pg_dump -Fc --schema=srh` preserves the schema name `srh`.  
`pg_restore` can filter schemas, but it does **not** rename schema `srh` to `srh_restore`.

Because of that, the clean workflow is:

1. Create the backup as a custom dump
2. Create a **plain SQL** dump of the same schema
3. Rewrite schema references from `srh` to `srh_restore` in the plain SQL file
4. Restore that rewritten SQL into the same database
5. Remap IDs in `srh_restore`
6. Replace/load the live `srh` data from `srh_restore`

---

## Step 1 — Start one `psql` session as `nap_admin`

From the shell:

```bash
psql -U nap_admin -d nap_dev
```

Inside `psql`, verify the connection:

```sql
\conninfo
```

Expected result: connected to database `nap_dev` as user `nap_admin`.

---

## Step 2 — Verify the schemas you expect exist

Inside `psql`:

```sql
\dn
```

Confirm:

- `admin` exists
- `srh` exists
- `srh_restore` does **not** already exist, or is safe to drop/recreate

If `srh_restore` already exists and should be rebuilt, drop it:

```sql
DROP SCHEMA IF EXISTS srh_restore CASCADE;
CREATE SCHEMA srh_restore;
```

---

## Step 3 — Create the schema backup files

From inside `psql`, use shell escape commands:

### 3A. Create a custom-format backup

```psql
\! pg_dump -U nap_admin -Fc --schema=srh -d nap_dev -f srh_schema.dump
```

### 3B. Create a plain SQL backup

```psql
\! pg_dump -U nap_admin --schema=srh -d nap_dev -f srh_schema.sql
```

### 3C. Verify both files exist

```psql
\! ls -lh srh_schema.dump srh_schema.sql
```

### 3D. Verify the custom dump looks valid

```psql
\! pg_restore -l srh_schema.dump | head
```

---

## Step 4 — Rewrite the plain SQL dump so it restores into `srh_restore`

Because the SQL file contains schema-qualified names like `srh.table_name`, rewrite them to `srh_restore.table_name`.

From inside `psql`:

```psql
\! perl -pe 's/\bsrh\./srh_restore./g; s/\bSCHEMA srh\b/SCHEMA srh_restore/g; s/\bsrh, pg_catalog\b/srh_restore, pg_catalog/g' srh_schema.sql > srh_restore_schema_safe.sql
```

### Verify the rewritten file

```psql
\! grep -n "CREATE SCHEMA" srh_restore_schema_safe.sql | head
\! grep -n "SET search_path" srh_restore_schema_safe.sql | head
```

You want to see references to `srh_restore`, not `srh`.

### Important note

A blanket text replacement is only safe if `srh` is used strictly as the schema name in your dump.  
Before proceeding, inspect the rewritten file if there is any chance that the literal word `srh` appears in data, comments, or function bodies where it should not be changed.

Useful spot checks:

```psql
\! less srh_restore_schema_safe.sql
```

---

## Step 5 — Restore the rewritten SQL into the staging schema

Inside `psql`:

```psql
\i srh_restore_schema_safe.sql
```

If the file is not in the current working directory, use the full path.

### Verify staging tables now exist

```sql
\dt srh_restore.*
```

### Quick row-count sanity checks

```sql
SELECT 'employees' AS table_name, count(*) FROM srh_restore.employees
UNION ALL
SELECT 'projects', count(*) FROM srh_restore.projects
UNION ALL
SELECT 'vendors', count(*) FROM srh_restore.vendors;
```

---

## Step 6 — Verify the stable remap keys before updating IDs

Before remapping anything, confirm the fields you will match on.

Examples:

```sql
SELECT id, code, name
FROM admin.tenants
ORDER BY code
LIMIT 20;
```

```sql
SELECT id, email, code
FROM srh_restore.employees
ORDER BY email NULLS LAST, code NULLS LAST
LIMIT 20;
```

```sql
SELECT id, email, entity_type, entity_id
FROM admin.nap_users
WHERE entity_type = 'employee'
ORDER BY email NULLS LAST
LIMIT 20;
```

Do **not** proceed until you know exactly:

- how a staged tenant maps to a live `admin.tenants` row
- how a staged employee maps to a live `admin.nap_users` / live employee row

### 6A. Ensure the SRH tenant exists in `admin.tenants`

If the SRH tenant has not yet been created, insert it before proceeding:

```sql
INSERT INTO admin.tenants
  (tenant_code, company, schema_name, status, tier, allowed_modules)
VALUES
  ('SRH','Sterling Ridge Homes, LLC','srh','active','growth','[]'::jsonb)
RETURNING id;
```

Record the returned `id`. This value will be used when remapping `tenant_id` values in the staged tables.

---

## Step 7 — Build explicit mapping tables

Use temporary tables so you can inspect the mappings before changing any business tables.

### 7A. Tenant ID map

Example using tenant `code`:

```sql
CREATE TEMP TABLE tenant_id_map AS
SELECT
    s.id  AS old_tenant_id,
    a.id  AS new_tenant_id,
    s.code
FROM srh_restore.tenants s
JOIN admin.tenants a
  ON a.code = s.code;
```

If `srh_restore.tenants` does not exist because tenant metadata lives only in `admin`, create the mapping from another staged table that contains a stable tenant key.

### 7B. Employee ID map

Example using email:

```sql
CREATE TEMP TABLE employee_id_map AS
SELECT
    e.id           AS old_employee_id,
    nu.entity_id   AS new_employee_id,
    e.email
FROM srh_restore.employees e
JOIN admin.nap_users nu
  ON nu.email = e.email
 AND nu.entity_type = 'employee'
 AND nu.deactivated_at IS NULL;
```

### 7C. Inspect the maps

```sql
SELECT * FROM tenant_id_map LIMIT 20;
SELECT * FROM employee_id_map LIMIT 20;
```

### 7D. Check for unmapped rows

```sql
SELECT e.id, e.email
FROM srh_restore.employees e
LEFT JOIN employee_id_map m
  ON m.old_employee_id = e.id
WHERE m.old_employee_id IS NULL
LIMIT 50;
```

```sql
SELECT DISTINCT p.tenant_id
FROM srh_restore.projects p
LEFT JOIN tenant_id_map m
  ON m.old_tenant_id = p.tenant_id
WHERE m.old_tenant_id IS NULL
LIMIT 50;
```

Do not continue until unmapped rows are understood.

---

## Step 8 — Remap cross-schema IDs in `srh_restore`

Only update the columns that should point to live `admin` rows.

### 8A. Example: remap `tenant_id`

For each `srh_restore` table that stores a tenant reference:

```sql
UPDATE srh_restore.projects p
SET tenant_id = m.new_tenant_id
FROM tenant_id_map m
WHERE p.tenant_id = m.old_tenant_id;
```

Repeat for every `srh_restore` table that contains a tenant reference.

### 8B. Example: remap `employee_id`

```sql
UPDATE srh_restore.deliverable_assignments d
SET employee_id = m.new_employee_id
FROM employee_id_map m
WHERE d.employee_id = m.old_employee_id;
```

Repeat for every `srh_restore` table that contains an employee reference.

### 8C. If `srh_restore.employees.id` itself must be rewritten

If the live system requires `srh.employees.id` to match `admin.nap_users.employee_id`, update the staged parent table first, then dependent child tables, or defer constraints temporarily.

Example pattern:

```sql
UPDATE srh_restore.employees e
SET id = m.new_employee_id
FROM employee_id_map m
WHERE e.id = m.old_employee_id;
```

Then update child tables that reference `employees.id`.

Because parent-key rewrites can be constraint-sensitive, test this carefully in staging before touching live `srh`.

---

## Step 9 — Validate the remapped staging data

Run checks before loading into live `srh`.

### 9A. Check for bad tenant references

```sql
SELECT count(*) AS missing_tenant_refs
FROM srh_restore.projects p
LEFT JOIN admin.tenants t
  ON t.id = p.tenant_id
WHERE t.id IS NULL;
```

### 9B. Check for bad employee references

```sql
SELECT count(*) AS missing_employee_refs
FROM srh_restore.deliverable_assignments d
LEFT JOIN srh_restore.employees e
  ON e.id = d.employee_id
WHERE e.id IS NULL;
```

### 9C. Spot-check a few business rows

```sql
SELECT *
FROM srh_restore.deliverable_assignments
LIMIT 20;
```

Only continue when these checks look correct.

---

## Step 10 — Load from `srh_restore` into live `srh`

⚠️ Important: load parent tables before dependent tables to satisfy foreign key constraints.  
For example:

1. `sources`
2. `employees`
3. other domain tables
4. `roles`
5. `policies`

If `employees.source_id` references `sources.id`, attempting to insert employees before sources will fail.

There are two common approaches.

### Approach A — Replace live `srh` completely

Use this only if you intend the restored/remapped data to become the full contents of `srh`.

Inside a transaction:

```sql
BEGIN;

TRUNCATE TABLE srh.deliverable_assignments,
               srh.projects,
               srh.employees
RESTART IDENTITY CASCADE;

INSERT INTO srh.employees
SELECT * FROM srh_restore.employees;

INSERT INTO srh.projects
SELECT * FROM srh_restore.projects;

INSERT INTO srh.deliverable_assignments
SELECT * FROM srh_restore.deliverable_assignments;

COMMIT;
```

Expand that pattern to all relevant tables, typically parent tables first if you are not using `TRUNCATE ... CASCADE`.

### Approach B — Merge selected tables/rows

Use this if the target `srh` already contains data you want to keep.

Example:

```sql
INSERT INTO srh.projects (id, tenant_id, name, company_id, address_id)
SELECT id, tenant_id, name, company_id, address_id
FROM srh_restore.projects
ON CONFLICT (id) DO UPDATE
SET tenant_id  = EXCLUDED.tenant_id,
    name       = EXCLUDED.name,
    company_id = EXCLUDED.company_id,
    address_id = EXCLUDED.address_id;
```

Choose this only when you have a clear merge rule.

---

## Step 11 — Verify the live `srh` schema after load

Examples:

```sql
SELECT count(*) FROM srh.employees;
SELECT count(*) FROM srh.projects;
SELECT count(*) FROM srh.deliverable_assignments;
```

Validate key relationships:

```sql
SELECT count(*) AS missing_employee_refs
FROM srh.deliverable_assignments d
LEFT JOIN srh.employees e
  ON e.id = d.employee_id
WHERE e.id IS NULL;
```

```sql
SELECT count(*) AS missing_tenant_refs
FROM srh.projects p
LEFT JOIN admin.tenants t
  ON t.id = p.tenant_id
WHERE t.id IS NULL;
```

---

## Step 12 — Clean up staging when finished

If everything is validated:

```sql
DROP SCHEMA srh_restore CASCADE;
```

If you want to keep staging for audit/debugging, leave it in place until the workflow is fully signed off.

---

## Recommended safety practices

- Run the whole process first in a non-production database
- Keep the original `srh_schema.dump` unchanged
- Prefer mapping by stable business keys, not display names
- Inspect unmapped rows before any update
- Use explicit transactions for destructive steps
- Do not modify the custom dump directly
- Keep a fresh full-database backup before replacing live `srh`
- When rewriting schema names in dump files, avoid global text replacement that can modify data values such as tenant codes.

---

## Minimal command summary

### Start session

```bash
psql -U nap_admin -d nap_dev
```

### Create backups

```psql
\! pg_dump -U nap_admin -Fc --schema=srh -d nap_dev -f srh_schema.dump
\! pg_dump -U nap_admin --schema=srh -d nap_dev -f srh_schema.sql
```

### Prepare staging SQL

```psql
DROP SCHEMA IF EXISTS srh_restore CASCADE;
CREATE SCHEMA srh_restore;
\! perl -pe 's/\bsrh\./srh_restore./g; s/\bSCHEMA srh\b/SCHEMA srh_restore/g; s/\bsrh, pg_catalog\b/srh_restore, pg_catalog/g' srh_schema.sql > srh_restore_schema_safe.sql
\i srh_restore_schema_safe.sql
```

### Remap and load

- create mapping tables
- update `srh_restore` IDs
- validate
- insert/merge into `srh`

---

## Final note

The exact remap SQL depends on your actual stable keys:

- tenant key in `admin.tenants`
- employee/user key between `srh_restore.employees` and `admin.nap_users`

Do not finalize the remap statements until those keys are confirmed.

# Production-Grade PostgreSQL Single-Schema Restore Workflow (`srh` -> `srh_restore` -> `srh`)

## Goal

Create a repeatable, production-safe workflow that:

- backs up the `srh` schema from `nap_dev`
- restores it into staging schema `srh_restore`
- automatically remaps tenant references to the live `admin.tenants` row for `SRH`
- loads data from `srh_restore` into live `srh`
- auto-generates dependency-safe load order from foreign key metadata
- avoids manual table-by-table inserts and ad hoc fixes

## Scope

This workflow assumes:

- database: `nap_dev`
- login role: `nap_admin`
- source schema: `srh`
- staging schema: `srh_restore`
- live reference schema: `admin`
- live target schema: `srh`
- tenant code: `SRH`
- tenant schema name: `srh`
- tenant company name: `Sterling Ridge Homes, LLC`

## Design principles

1. Never modify the custom dump.
2. Never use blanket text replacement that can alter data values.
3. Generate load order from PostgreSQL metadata instead of hard-coding table order.
4. Normalize staged tenant references in SQL before loading live data.
5. Use one repeatable script so the workflow is deterministic.

---

## Overview

The production workflow is:

1. Create backup artifacts for schema `srh`
2. Rewrite only schema references in the plain SQL dump
3. Restore into `srh_restore`
4. Ensure the live `SRH` tenant exists in `admin.tenants`
5. Normalize staged tenant references to the live tenant id
6. Normalize staged tenant codes to `SRH`
7. Generate dependency-safe load order from foreign key metadata
8. Truncate live `srh` tables in reverse dependency order
9. Insert staged data into live `srh` in dependency order
10. Run validation checks
11. Drop `srh_restore`

---

## Files produced

- `srh_schema.dump`
- `srh_schema.sql`
- `srh_restore_schema_safe.sql`
- `tmp/srh_load_order.txt`
- `tmp/srh_truncate_order.txt`
- `tmp/srh_restore_run.sql`

---

## One-command execution pattern

Preferred entry point:

```bash
bash scripts/db/restore_srh_schema.sh
```

That script should:

- fail on first error
- create the backup artifacts
- restore staging
- generate load/truncate order from FK metadata
- remap tenant references automatically
- load live schema
- validate results
- clean up staging

---

## Required shell safety

Use this at the top of the script:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
```

---

## Step 1 — Ensure `.pgpass` is configured

The workflow uses `psql`, `pg_dump`, and `pg_restore` as separate processes. Configure `.pgpass` so the script is non-interactive.

Example:

```text
*:5432:nap_dev:nap_admin:YOUR_PASSWORD
```

---

## Step 2 — Create backup files

```bash
pg_dump -U nap_admin -Fc --schema=srh -d nap_dev -f srh_schema.dump
pg_dump -U nap_admin --schema=srh -d nap_dev -f srh_schema.sql
pg_restore -l srh_schema.dump | head
```

---

## Step 3 — Rewrite only schema references for staging

Do not globally replace every occurrence of `srh`.

Use:

```bash
perl -pe 's/\bsrh\./srh_restore./g; s/\bSCHEMA srh\b/SCHEMA srh_restore/g; s/\bsrh, pg_catalog\b/srh_restore, pg_catalog/g' srh_schema.sql > srh_restore_schema_safe.sql
```

Verify:

```bash
grep -n "CREATE SCHEMA" srh_restore_schema_safe.sql | head
grep -n 'COPY srh_restore\.' srh_restore_schema_safe.sql | head
```

---

## Step 4 — Restore into staging schema

```sql
DROP SCHEMA IF EXISTS srh_restore CASCADE;
CREATE SCHEMA srh_restore;
\i srh_restore_schema_safe.sql
```

Sanity check:

```sql
\dt srh_restore.*
```

---

## Step 5 — Ensure the live SRH tenant exists

```sql
INSERT INTO admin.tenants
  (tenant_code, company, schema_name, status, tier, allowed_modules)
SELECT
  'SRH',
  'Sterling Ridge Homes, LLC',
  'srh',
  'active',
  'growth',
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM admin.tenants
  WHERE tenant_code = 'SRH'
    AND schema_name = 'srh'
);
```

Resolve the live tenant id:

```sql
SELECT id
FROM admin.tenants
WHERE tenant_code = 'SRH'
  AND schema_name = 'srh';
```

---

## Step 6 — Auto-remap staged tenant references

### 6A. Generate the list of staged tables with `tenant_id`

```sql
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'srh_restore'
  AND column_name = 'tenant_id'
  AND table_name NOT LIKE 'vw_%'
ORDER BY table_name;
```

### 6B. Normalize all staged `tenant_id` values to the live SRH tenant id

Use a dynamic SQL block so no manual per-table updates are needed:

```sql
DO $$
DECLARE
    v_live_tenant_id uuid;
    r record;
BEGIN
    SELECT id
      INTO v_live_tenant_id
    FROM admin.tenants
    WHERE tenant_code = 'SRH'
      AND schema_name = 'srh';

    IF v_live_tenant_id IS NULL THEN
        RAISE EXCEPTION 'SRH tenant not found in admin.tenants';
    END IF;

    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_id'
          AND table_name NOT LIKE 'vw_%'
        ORDER BY table_name
    LOOP
        EXECUTE format(
            'UPDATE srh_restore.%I SET tenant_id = $1 WHERE tenant_id <> $1',
            r.table_name
        )
        USING v_live_tenant_id;
    END LOOP;
END $$;
```

This removes the need to manually identify and patch old tenant ids.

### 6C. Normalize staged `tenant_code` values to `SRH`

```sql
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_code'
          AND table_name NOT LIKE 'vw_%'
        ORDER BY table_name
    LOOP
        EXECUTE format(
            $$UPDATE srh_restore.%I SET tenant_code = 'SRH' WHERE tenant_code <> 'SRH'$$,
            r.table_name
        );
    END LOOP;
END $$;
```

---

## Step 7 — Ensure app-user identities exist in `admin.nap_users`

For staged employees with `is_app_user = true`, ensure a corresponding `admin.nap_users` row exists.

```sql
INSERT INTO admin.nap_users
  (tenant_id, entity_type, entity_id, email, password_hash, status)
SELECT
  t.id,
  'employee',
  e.id,
  e.email,
  'PENDING_RESET',
  'invited'
FROM srh_restore.employees e
CROSS JOIN LATERAL (
  SELECT id
  FROM admin.tenants
  WHERE tenant_code = 'SRH'
    AND schema_name = 'srh'
) t
WHERE e.is_app_user = true
  AND NOT EXISTS (
    SELECT 1
    FROM admin.nap_users u
    WHERE u.email = e.email
      AND u.deactivated_at IS NULL
  );
```

---

## Step 8 — Generate dependency-safe load order from FK metadata

### 8A. Load order query

This query returns tables in dependency order so parent tables load before child tables.

```sql
WITH RECURSIVE fk_edges AS (
    SELECT
        tc.table_name       AS child_table,
        ccu.table_name      AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'srh'
      AND ccu.table_schema = 'srh'
),
all_tables AS (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'srh'
      AND table_type = 'BASE TABLE'
),
roots AS (
    SELECT t.table_name
    FROM all_tables t
    WHERE NOT EXISTS (
        SELECT 1
        FROM fk_edges e
        WHERE e.child_table = t.table_name
    )
),
walk AS (
    SELECT r.table_name, 0 AS depth
    FROM roots r

    UNION ALL

    SELECT e.child_table, w.depth + 1
    FROM walk w
    JOIN fk_edges e
      ON e.parent_table = w.table_name
),
ranked AS (
    SELECT table_name, max(depth) AS depth
    FROM walk
    GROUP BY table_name
)
SELECT t.table_name
FROM all_tables t
LEFT JOIN ranked r
  ON r.table_name = t.table_name
ORDER BY coalesce(r.depth, 0), t.table_name;
```

### 8B. Truncate order

Use the reverse of load order.

---

## Step 9 — Generate repeatable SQL from metadata

### 9A. Generate truncate statements

```sql
WITH RECURSIVE fk_edges AS (
    SELECT
        tc.table_name       AS child_table,
        ccu.table_name      AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'srh'
      AND ccu.table_schema = 'srh'
),
all_tables AS (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'srh'
      AND table_type = 'BASE TABLE'
),
roots AS (
    SELECT t.table_name
    FROM all_tables t
    WHERE NOT EXISTS (
        SELECT 1
        FROM fk_edges e
        WHERE e.child_table = t.table_name
    )
),
walk AS (
    SELECT r.table_name, 0 AS depth
    FROM roots r
    UNION ALL
    SELECT e.child_table, w.depth + 1
    FROM walk w
    JOIN fk_edges e
      ON e.parent_table = w.table_name
),
ranked AS (
    SELECT table_name, max(depth) AS depth
    FROM walk
    GROUP BY table_name
)
SELECT format('TRUNCATE TABLE srh.%I CASCADE;', t.table_name)
FROM all_tables t
LEFT JOIN ranked r
  ON r.table_name = t.table_name
ORDER BY coalesce(r.depth, 0) DESC, t.table_name DESC;
```

### 9B. Generate insert statements

```sql
SELECT format('INSERT INTO srh.%1$I SELECT * FROM srh_restore.%1$I;', table_name)
FROM (
    WITH RECURSIVE fk_edges AS (
        SELECT
            tc.table_name       AS child_table,
            ccu.table_name      AS parent_table
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'srh'
          AND ccu.table_schema = 'srh'
    ),
    all_tables AS (
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'srh'
          AND table_type = 'BASE TABLE'
    ),
    roots AS (
        SELECT t.table_name
        FROM all_tables t
        WHERE NOT EXISTS (
            SELECT 1
            FROM fk_edges e
            WHERE e.child_table = t.table_name
        )
    ),
    walk AS (
        SELECT r.table_name, 0 AS depth
        FROM roots r
        UNION ALL
        SELECT e.child_table, w.depth + 1
        FROM walk w
        JOIN fk_edges e
          ON e.parent_table = w.table_name
    ),
    ranked AS (
        SELECT table_name, max(depth) AS depth
        FROM walk
        GROUP BY table_name
    )
    SELECT t.table_name, coalesce(r.depth, 0) AS depth
    FROM all_tables t
    LEFT JOIN ranked r
      ON r.table_name = t.table_name
) q
ORDER BY depth, table_name;
```

---

## Step 10 — Build a repeatable restore script

Recommended file:

`script્સ/db/restore_srh_schema.sh`

Recommended behavior:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

DB_NAME="nap_dev"
DB_USER="nap_admin"
SOURCE_SCHEMA="srh"
STAGE_SCHEMA="srh_restore"
TMP_DIR="tmp"

mkdir -p "$TMP_DIR"

psql_cmd=(psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1)

pg_dump -U "$DB_USER" -Fc --schema="$SOURCE_SCHEMA" -d "$DB_NAME" -f srh_schema.dump
pg_dump -U "$DB_USER" --schema="$SOURCE_SCHEMA" -d "$DB_NAME" -f srh_schema.sql

perl -pe 's/\bsrh\./srh_restore./g; s/\bSCHEMA srh\b/SCHEMA srh_restore/g; s/\bsrh, pg_catalog\b/srh_restore, pg_catalog/g' srh_schema.sql > srh_restore_schema_safe.sql

"${psql_cmd[@]}" <<'SQL'
DROP SCHEMA IF EXISTS srh_restore CASCADE;
CREATE SCHEMA srh_restore;
\i srh_restore_schema_safe.sql
SQL

"${psql_cmd[@]}" <<'SQL'
INSERT INTO admin.tenants
  (tenant_code, company, schema_name, status, tier, allowed_modules)
SELECT
  'SRH',
  'Sterling Ridge Homes, LLC',
  'srh',
  'active',
  'growth',
  '[]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM admin.tenants
  WHERE tenant_code = 'SRH'
    AND schema_name = 'srh'
);
SQL

"${psql_cmd[@]}" <<'SQL'
DO $$
DECLARE
    v_live_tenant_id uuid;
    r record;
BEGIN
    SELECT id
      INTO v_live_tenant_id
    FROM admin.tenants
    WHERE tenant_code = 'SRH'
      AND schema_name = 'srh';

    IF v_live_tenant_id IS NULL THEN
        RAISE EXCEPTION 'SRH tenant not found in admin.tenants';
    END IF;

    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_id'
          AND table_name NOT LIKE 'vw_%'
    LOOP
        EXECUTE format(
            'UPDATE srh_restore.%I SET tenant_id = $1 WHERE tenant_id <> $1',
            r.table_name
        )
        USING v_live_tenant_id;
    END LOOP;

    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_code'
          AND table_name NOT LIKE 'vw_%'
    LOOP
        EXECUTE format(
            $$UPDATE srh_restore.%I SET tenant_code = 'SRH' WHERE tenant_code <> 'SRH'$$,
            r.table_name
        );
    END LOOP;
END $$;
SQL

"${psql_cmd[@]}" -At <<'SQL' > "$TMP_DIR/srh_restore_run.sql"
WITH RECURSIVE fk_edges AS (
    SELECT tc.table_name AS child_table, ccu.table_name AS parent_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'srh'
      AND ccu.table_schema = 'srh'
),
all_tables AS (
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'srh'
      AND table_type = 'BASE TABLE'
),
roots AS (
    SELECT t.table_name
    FROM all_tables t
    WHERE NOT EXISTS (
      SELECT 1 FROM fk_edges e WHERE e.child_table = t.table_name
    )
),
walk AS (
    SELECT r.table_name, 0 AS depth
    FROM roots r
    UNION ALL
    SELECT e.child_table, w.depth + 1
    FROM walk w
    JOIN fk_edges e ON e.parent_table = w.table_name
),
ranked AS (
    SELECT table_name, max(depth) AS depth
    FROM walk
    GROUP BY table_name
),
ordered AS (
    SELECT t.table_name, coalesce(r.depth, 0) AS depth
    FROM all_tables t
    LEFT JOIN ranked r ON r.table_name = t.table_name
)
SELECT 'BEGIN;'
UNION ALL
SELECT format('TRUNCATE TABLE srh.%I CASCADE;', table_name)
FROM ordered
ORDER BY 1 DESC
UNION ALL
SELECT format('INSERT INTO srh.%1$I SELECT * FROM srh_restore.%1$I;', table_name)
FROM ordered
ORDER BY 1
UNION ALL
SELECT 'COMMIT;';
SQL

"${psql_cmd[@]}" -f "$TMP_DIR/srh_restore_run.sql"

"${psql_cmd[@]}" <<'SQL'
DROP SCHEMA srh_restore CASCADE;
SQL
```

Note: keep the actual implementation readable by generating truncate and insert SQL in separate temp files if preferred.

---

## Step 11 — Production validation queries

```sql
SELECT 'employees missing tenant' AS check_name, count(*) AS issue_count
FROM srh.employees e
LEFT JOIN admin.tenants t
  ON t.id = e.tenant_id
WHERE t.id IS NULL

UNION ALL

SELECT 'sources missing tenant', count(*)
FROM srh.sources s
LEFT JOIN admin.tenants t
  ON t.id = s.tenant_id
WHERE t.id IS NULL

UNION ALL

SELECT 'app-user employees missing nap_users row', count(*)
FROM srh.employees e
LEFT JOIN admin.nap_users u
  ON u.entity_type = 'employee'
 AND u.entity_id = e.id
 AND u.deactivated_at IS NULL
WHERE e.is_app_user = true
  AND u.id IS NULL

UNION ALL

SELECT 'nap_users rows pointing to missing employee', count(*)
FROM admin.nap_users u
LEFT JOIN srh.employees e
  ON e.id = u.entity_id
WHERE u.tenant_id = (
    SELECT id
    FROM admin.tenants
    WHERE tenant_code = 'SRH'
      AND schema_name = 'srh'
)
  AND u.entity_type = 'employee'
  AND u.deactivated_at IS NULL
  AND e.id IS NULL;
```

All counts should be `0`.

---

## Operational notes

- `admin.nap_users.entity_id` is the employee link field, not `employee_id`.
- App-user rows should be filtered with `is_app_user = true`.
- Schema rewrite should only touch executable schema references.
- Tenant remap should be dynamic and global across all staged tables that contain `tenant_id`.
- Load order should come from FK metadata, not from guesswork.

---

## Recommended next improvements

1. Move the load-order SQL into a reusable view or helper script.
2. Add `--dry-run` mode to the shell script.
3. Add logging to `tmp/restore_srh_*.log`.
4. Add post-load row-count comparisons between `srh_restore` and `srh`.
5. Add a guard that aborts if staging contains unexpected tenant ids after remap.

---

## Final recommendation

Keep this workflow as documentation, but treat the shell script as the source of truth.

The script should be the artifact operators actually run. The markdown should explain:

- why the process works
- how load order is generated
- how tenant remap is enforced
- how to validate the result
