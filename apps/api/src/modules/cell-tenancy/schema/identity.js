/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { requireCondition } from '../../../application/shared/errors.js';

/**
 * Check a connected cell's physical identity against its `admin.cells`
 * record before the cell is trusted to serve any tenant request.
 *
 * Unlike `verifyCell`, a mismatch here is an expected per-cell outcome, not
 * an invariant violation: the caller (the runtime cell registry) decides
 * what to do with a not-ready cell, so this never throws for a data
 * mismatch, only for a malformed `adminCellRecord`.
 * @param {import('pg-schemata').Database} cellHandle Connected handle for the cell, at least `nap-app` privilege.
 * @param {{ id: string, database_name: string }} adminCellRecord The cell's own `admin.cells` row.
 * @returns {Promise<{ ready: true } | { ready: false, reason: 'IDENTITY_MISSING' | 'IDENTITY_MISMATCH' | 'DATABASE_MISMATCH' }>}
 */
export async function verifyPhysicalIdentity(cellHandle, adminCellRecord) {
  requireCondition(
    adminCellRecord?.id && adminCellRecord?.database_name,
    'INVALID_ADMIN_CELL_RECORD'
  );
  const { db } = cellHandle;
  const identity = await db.physical_identity.findOneBy([], {
    columnWhitelist: ['cell_id', 'database_name'],
  });
  if (!identity) return { ready: false, reason: 'IDENTITY_MISSING' };
  if (identity.cell_id !== adminCellRecord.id) {
    return { ready: false, reason: 'IDENTITY_MISMATCH' };
  }
  const { name } = await db.one('SELECT current_database() AS name');
  if (
    identity.database_name !== name ||
    identity.database_name !== adminCellRecord.database_name
  ) {
    return { ready: false, reason: 'DATABASE_MISMATCH' };
  }
  return { ready: true };
}
