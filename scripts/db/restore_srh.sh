#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# restore_srh.sh
#
# Rebuilds the entire database from scratch (admin + NapSoft root +
# SRH tenant) then restores SRH business data from a backup while
# keeping a freshly-seeded policy_catalog.
#
# Expects a backup dir containing:
#   - srh_schema.sql   (plain SQL dump of the srh schema)
#   - nap_users_srh.csv (admin.nap_users rows for SRH)
#
# These files are produced by backup_srh.sh.
#
# Prerequisites:
#   - .pgpass or PGPASSWORD configured for nap_admin
#   - Node >= 20, npm workspaces installed
#   - Run from the monorepo root
#
# Usage:
#   bash scripts/db/restore_srh.sh [backup_dir]
#
#   backup_dir  Path to directory with backup files.
#               Defaults to tmp/srh_backups.
#
# Copyright (c) 2025 NapSoft LLC. All rights reserved.
# ────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

# ─── Configuration ────────────────────────────────────────────────
DB_NAME="nap_dev"
DB_USER="nap_admin"
SOURCE_SCHEMA="srh"
STAGE_SCHEMA="srh_restore"
TENANT_CODE="SRH"
COMPANY="Sterling Ridge Homes, LLC"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERV_DIR="$REPO_ROOT/apps/nap-serv"
BACKUP_DIR="${1:-$REPO_ROOT/tmp/srh_backups}"

# Validate backup files exist
if [ ! -f "$BACKUP_DIR/srh_schema.sql" ]; then
  echo "ERROR: $BACKUP_DIR/srh_schema.sql not found."
  echo "Run backup_srh.sh first to create the backup files."
  exit 1
fi
if [ ! -f "$BACKUP_DIR/nap_users_srh.csv" ]; then
  echo "ERROR: $BACKUP_DIR/nap_users_srh.csv not found."
  echo "Run backup_srh.sh first to create the backup files."
  exit 1
fi

PSQL=(psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1)

# Tables to exclude from truncate/insert (freshly seeded during provisioning)
EXCLUDE_TABLES="'policy_catalog'"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SRH Schema Restore                                        ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Backup dir: $BACKUP_DIR"
echo ""

# ══════════════════════════════════════════════════════════════════
# Step 1: Drop all schemas
# ══════════════════════════════════════════════════════════════════
echo "=== Step 1: Drop all schemas ==="

SCHEMAS=$("${PSQL[@]}" -At -c "
  SELECT schema_name
  FROM information_schema.schemata
  WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
    AND schema_name NOT LIKE 'pg_toast%'
    AND schema_name NOT LIKE 'pg_temp_%'
  ORDER BY schema_name;
")

for schema in $SCHEMAS; do
  echo "  Dropping: $schema"
  "${PSQL[@]}" -c "DROP SCHEMA IF EXISTS ${schema} CASCADE;"
done

echo ""

# ══════════════════════════════════════════════════════════════════
# Step 2: Recreate public schema
# ══════════════════════════════════════════════════════════════════
echo "=== Step 2: Recreate public schema ==="
"${PSQL[@]}" -c "CREATE SCHEMA IF NOT EXISTS public;"
echo "  Done."
echo ""

# ══════════════════════════════════════════════════════════════════
# Step 3: Run setupAdmin
# ══════════════════════════════════════════════════════════════════
echo "=== Step 3: Run setupAdmin ==="
cd "$SERV_DIR"
npx cross-env NODE_ENV=development node ./scripts/setupAdmin.js
cd "$REPO_ROOT"
echo ""

# ══════════════════════════════════════════════════════════════════
# Step 4: Provision SRH tenant
# ══════════════════════════════════════════════════════════════════
echo "=== Step 4: Provision SRH tenant ==="
cd "$SERV_DIR"
npx cross-env NODE_ENV=development node "$SCRIPT_DIR/provisionTenantCli.js" \
  --tenant-code "$TENANT_CODE" \
  --company "$COMPANY" \
  --schema-name "$SOURCE_SCHEMA"
cd "$REPO_ROOT"
echo ""

# ══════════════════════════════════════════════════════════════════
# Step 5: Restore from backup
# ══════════════════════════════════════════════════════════════════
echo "=== Step 5: Restore SRH data from backup ==="

# 5a. Rewrite SQL dump: srh -> srh_restore
echo "  5a. Rewriting schema references for staging..."
perl -pe '
  s/(?<!\@)\bsrh\./srh_restore./g;
  s/\bSCHEMA srh\b/SCHEMA srh_restore/g;
  s/\bsrh, pg_catalog\b/srh_restore, pg_catalog/g;
' "$BACKUP_DIR/srh_schema.sql" > "$BACKUP_DIR/srh_restore_schema_safe.sql"

# 5b. Restore into staging schema
echo "  5b. Restoring into srh_restore..."
"${PSQL[@]}" -c "DROP SCHEMA IF EXISTS $STAGE_SCHEMA CASCADE;"
"${PSQL[@]}" -f "$BACKUP_DIR/srh_restore_schema_safe.sql"

# 5c. Remap tenant_id and tenant_code
echo "  5c. Remapping tenant_id and tenant_code..."
"${PSQL[@]}" <<'REMAP_SQL'
DO $$
DECLARE
    v_live_tenant_id uuid;
    r record;
    v_count integer;
BEGIN
    SELECT id INTO v_live_tenant_id
    FROM admin.tenants
    WHERE tenant_code = 'SRH' AND schema_name = 'srh';

    IF v_live_tenant_id IS NULL THEN
        RAISE EXCEPTION 'SRH tenant not found in admin.tenants after provisioning';
    END IF;

    RAISE NOTICE 'Live SRH tenant_id: %', v_live_tenant_id;

    -- Remap tenant_id in all staged tables
    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_id'
          AND table_name NOT LIKE 'vw_%'
        ORDER BY table_name
    LOOP
        EXECUTE format(
            'UPDATE srh_restore.%I SET tenant_id = $1 WHERE tenant_id IS DISTINCT FROM $1',
            r.table_name
        ) USING v_live_tenant_id;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
            RAISE NOTICE '  tenant_id remapped in %: % rows', r.table_name, v_count;
        END IF;
    END LOOP;

    -- Remap tenant_code in all staged tables
    FOR r IN
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'srh_restore'
          AND column_name = 'tenant_code'
          AND table_name NOT LIKE 'vw_%'
        ORDER BY table_name
    LOOP
        EXECUTE format(
            $q$UPDATE srh_restore.%I SET tenant_code = 'SRH' WHERE tenant_code IS DISTINCT FROM 'SRH'$q$,
            r.table_name
        );
        GET DIAGNOSTICS v_count = ROW_COUNT;
        IF v_count > 0 THEN
            RAISE NOTICE '  tenant_code remapped in %: % rows', r.table_name, v_count;
        END IF;
    END LOOP;
END $$;
REMAP_SQL

# 5d. Generate FK-safe truncate statements (reverse dependency order)
echo "  5d. Generating FK-safe truncate order..."
"${PSQL[@]}" -At <<TRUNCATE_SQL > "$BACKUP_DIR/truncate_srh.sql"
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
      AND table_name NOT IN (${EXCLUDE_TABLES})
),
roots AS (
    SELECT t.table_name
    FROM all_tables t
    WHERE NOT EXISTS (
        SELECT 1 FROM fk_edges e
        WHERE e.child_table = t.table_name
          AND e.parent_table IN (SELECT table_name FROM all_tables)
          AND e.parent_table <> e.child_table
    )
),
walk AS (
    SELECT r.table_name, 0 AS depth FROM roots r
    UNION ALL
    SELECT e.child_table, w.depth + 1
    FROM walk w
    JOIN fk_edges e ON e.parent_table = w.table_name
    WHERE e.child_table IN (SELECT table_name FROM all_tables)
      AND e.child_table <> e.parent_table
      AND w.depth < 50
),
ranked AS (
    SELECT table_name, max(depth) AS depth
    FROM walk
    GROUP BY table_name
)
SELECT format('TRUNCATE TABLE srh.%I CASCADE;', t.table_name)
FROM all_tables t
LEFT JOIN ranked r ON r.table_name = t.table_name
ORDER BY coalesce(r.depth, 0) DESC, t.table_name DESC;
TRUNCATE_SQL

# 5e. Generate FK-safe insert statements (dependency order)
#     Uses explicit column lists to skip generated columns (e.g. amount).
echo "  5e. Generating FK-safe insert order..."
"${PSQL[@]}" -At <<INSERT_SQL > "$BACKUP_DIR/insert_srh.sql"
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
      AND table_name NOT IN (${EXCLUDE_TABLES})
),
roots AS (
    SELECT t.table_name
    FROM all_tables t
    WHERE NOT EXISTS (
        SELECT 1 FROM fk_edges e
        WHERE e.child_table = t.table_name
          AND e.parent_table IN (SELECT table_name FROM all_tables)
          AND e.parent_table <> e.child_table
    )
),
walk AS (
    SELECT r.table_name, 0 AS depth FROM roots r
    UNION ALL
    SELECT e.child_table, w.depth + 1
    FROM walk w
    JOIN fk_edges e ON e.parent_table = w.table_name
    WHERE e.child_table IN (SELECT table_name FROM all_tables)
      AND e.child_table <> e.parent_table
      AND w.depth < 50
),
ranked AS (
    SELECT table_name, max(depth) AS depth
    FROM walk
    GROUP BY table_name
),
-- Build explicit column list per table, excluding generated columns
table_cols AS (
    SELECT
        c.table_name,
        string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position) AS col_list
    FROM information_schema.columns c
    WHERE c.table_schema = 'srh'
      AND c.table_name IN (SELECT table_name FROM all_tables)
      AND c.is_generated = 'NEVER'
      AND c.generation_expression IS NULL
    GROUP BY c.table_name
)
SELECT format(
    'INSERT INTO srh.%I (%s) SELECT %s FROM srh_restore.%I;',
    t.table_name, tc.col_list, tc.col_list, t.table_name
)
FROM all_tables t
JOIN table_cols tc ON tc.table_name = t.table_name
LEFT JOIN ranked r ON r.table_name = t.table_name
ORDER BY coalesce(r.depth, 0), t.table_name;
INSERT_SQL

# 5f. Execute truncate + insert in a transaction
echo "  5f. Loading data from srh_restore into srh..."
{
  echo "BEGIN;"
  cat "$BACKUP_DIR/truncate_srh.sql"
  cat "$BACKUP_DIR/insert_srh.sql"
  echo "COMMIT;"
} > "$BACKUP_DIR/restore_transaction.sql"

"${PSQL[@]}" -f "$BACKUP_DIR/restore_transaction.sql"

echo ""

# ══════════════════════════════════════════════════════════════════
# Step 6: Restore admin.nap_users for SRH
# ══════════════════════════════════════════════════════════════════
echo "=== Step 6: Restore admin.nap_users for SRH ==="

NEW_TENANT_ID=$("${PSQL[@]}" -At -c "
  SELECT id FROM admin.tenants
  WHERE tenant_code = '$TENANT_CODE' AND schema_name = '$SOURCE_SCHEMA';
")

if [ -z "$NEW_TENANT_ID" ]; then
  echo "ERROR: Could not find SRH tenant after provisioning"
  exit 1
fi

echo "  New SRH tenant_id: $NEW_TENANT_ID"

# 6a. Try to restore from CSV backup (preserves password hashes)
#     Use LIKE to match real column order (avoids positional mismatch with \COPY)
CSV_ROWS=$("${PSQL[@]}" -At <<USERS_CSV_SQL
CREATE TEMP TABLE _nap_users_restore (LIKE admin.nap_users INCLUDING DEFAULTS);

\\COPY _nap_users_restore FROM '$BACKUP_DIR/nap_users_srh.csv' WITH (FORMAT csv, HEADER true)

UPDATE _nap_users_restore SET tenant_id = '${NEW_TENANT_ID}'::uuid;

INSERT INTO admin.nap_users
  (id, tenant_id, entity_type, entity_id, email, password_hash, status,
   created_at, created_by, updated_at, updated_by, deactivated_at)
SELECT
  gen_random_uuid(), r.tenant_id, r.entity_type, r.entity_id,
  r.email, r.password_hash, r.status,
  r.created_at, r.created_by, r.updated_at, r.updated_by,
  r.deactivated_at
FROM _nap_users_restore r
WHERE NOT EXISTS (
  SELECT 1 FROM admin.nap_users u
  WHERE u.email = r.email AND u.deactivated_at IS NULL
);

SELECT count(*) FROM _nap_users_restore;

DROP TABLE _nap_users_restore;
USERS_CSV_SQL
)

echo "  CSV rows loaded: $CSV_ROWS"

# 6b. Create nap_users for any app-user employees still missing
#     (covers fresh provisions or empty CSV backups)
CREATED=$("${PSQL[@]}" -At <<'USERS_FALLBACK_SQL'
WITH inserted AS (
  INSERT INTO admin.nap_users
    (tenant_id, entity_type, entity_id, email, password_hash, status)
  SELECT
    t.id,
    'employee',
    e.id,
    e.email,
    'PENDING_RESET',
    'invited'
  FROM srh.employees e
  CROSS JOIN LATERAL (
    SELECT id FROM admin.tenants
    WHERE tenant_code = 'SRH' AND schema_name = 'srh'
  ) t
  WHERE e.is_app_user = true
    AND e.deactivated_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM admin.nap_users u
      WHERE u.email = e.email AND u.deactivated_at IS NULL
    )
  RETURNING id
)
SELECT count(*) FROM inserted;
USERS_FALLBACK_SQL
)

if [ "$CREATED" -gt 0 ]; then
  echo "  Created $CREATED nap_users entries (PENDING_RESET) for app-user employees"
else
  echo "  All app-user employees already have nap_users entries"
fi

echo ""

# ══════════════════════════════════════════════════════════════════
# Step 7: Validate
# ══════════════════════════════════════════════════════════════════
echo "=== Step 7: Validate ==="

VALIDATION=$("${PSQL[@]}" -At <<'VALIDATE_SQL'
SELECT check_name || ': ' || issue_count
FROM (
  SELECT 'employees missing tenant ref' AS check_name, count(*) AS issue_count
  FROM srh.employees e
  LEFT JOIN admin.tenants t ON t.id = e.tenant_id
  WHERE t.id IS NULL

  UNION ALL

  SELECT 'app-user employees missing nap_users', count(*)
  FROM srh.employees e
  LEFT JOIN admin.nap_users u
    ON u.entity_type = 'employee'
   AND u.entity_id = e.id
   AND u.deactivated_at IS NULL
  WHERE e.is_app_user = true
    AND e.deactivated_at IS NULL
    AND u.id IS NULL

  UNION ALL

  SELECT 'nap_users pointing to missing employee', count(*)
  FROM admin.nap_users u
  LEFT JOIN srh.employees e ON e.id = u.entity_id
  WHERE u.tenant_id = (
    SELECT id FROM admin.tenants
    WHERE tenant_code = 'SRH' AND schema_name = 'srh'
  )
    AND u.entity_type = 'employee'
    AND u.deactivated_at IS NULL
    AND e.id IS NULL

  UNION ALL

  SELECT 'policy_catalog total entries', count(*)
  FROM srh.policy_catalog

  UNION ALL

  SELECT 'policy_catalog with valid_statuses', count(*)
  FROM srh.policy_catalog
  WHERE valid_statuses IS NOT NULL

  UNION ALL

  SELECT 'policy_catalog with available_fields', count(*)
  FROM srh.policy_catalog
  WHERE available_fields IS NOT NULL
) checks;
VALIDATE_SQL
)

echo "$VALIDATION"
echo ""

# Check for integrity issues
ISSUES=$(echo "$VALIDATION" | grep -E '^(employees missing|app-user|nap_users pointing)' | grep -v ': 0$' || true)
if [ -n "$ISSUES" ]; then
  echo "WARNING: Validation found issues:"
  echo "$ISSUES"
  echo ""
fi

# ══════════════════════════════════════════════════════════════════
# Step 8: Clean up staging
# ══════════════════════════════════════════════════════════════════
echo "=== Step 8: Clean up ==="
"${PSQL[@]}" -c "DROP SCHEMA IF EXISTS $STAGE_SCHEMA CASCADE;"
echo "  Dropped srh_restore staging schema."
echo ""

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Restore complete                                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
