/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Does: Describes creation and update timestamps and nullable actor IDs.
 * Used by: module row types for tables with pg-schemata audit fields enabled.
 */
export type AuditFields = {
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
};

/**
 * Does: Describes when a stored record was deactivated, or null while active.
 * Used by: module row types for tables with pg-schemata soft deletion enabled.
 */
export type SoftDelete = {
  deactivated_at: Date | null;
};
