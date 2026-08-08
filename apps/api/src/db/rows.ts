/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Columns pg-schemata appends when `hasAuditFields` is enabled with
 * `userFields: { type: 'uuid' }`. Never declared in a model's column list —
 * the library adds them (and rejects manual declarations).
 */
export interface AuditRow {
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
}

/**
 * The universal row shape (DESIGN.md §2.4): uuid `id` primary key, audit
 * columns, and the `deactivated_at` soft-delete column pg-schemata appends
 * when `softDelete` is enabled. Tables that opt out of parts of this
 * (`admin.countries`, `policy_catalog`) type their rows directly.
 */
export interface EntityRow extends AuditRow {
  id: string;
  deactivated_at: Date | null;
}
