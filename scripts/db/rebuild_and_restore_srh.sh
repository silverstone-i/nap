#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────
# rebuild_and_restore_srh.sh
#
# One ring to rule them all: backs up the SRH tenant schema, then
# rebuilds the database and restores the data in a single step.
#
# Delegates to:
#   - backup_srh.sh   (backup SRH schema + nap_users)
#   - restore_srh.sh  (drop → setupAdmin → provision → restore)
#
# Prerequisites:
#   - .pgpass or PGPASSWORD configured for nap_admin
#   - Node >= 20, npm workspaces installed
#   - Run from the monorepo root
#
# Usage:
#   bash scripts/db/rebuild_and_restore_srh.sh
#
# Copyright (c) 2025 NapSoft LLC. All rights reserved.
# ────────────────────────────────────────────────────────────────────
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SRH Schema Rebuild & Restore                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Phase 1: Backup ──────────────────────────────────────────────
bash "$SCRIPT_DIR/backup_srh.sh"

# ── Phase 2: Restore ─────────────────────────────────────────────
bash "$SCRIPT_DIR/restore_srh.sh"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Rebuild and restore complete                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
