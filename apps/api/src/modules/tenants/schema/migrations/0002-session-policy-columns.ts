/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration } from 'pg-schemata';
import type { Migration } from 'pg-schemata';

/**
 * PRD 0004 / ADR-0014: per-tenant session policy — idle-window bounds and the
 * absolute lifetime. Fresh schemas get the columns from `0001-create-tables`;
 * each ADD COLUMN is IF NOT EXISTS so this run is a no-op there.
 * Schema comes from the context, never a literal (RULES/db-and-migrations.md).
 */
export const sessionPolicyColumns: Migration = defineMigration({
  id: '0002-session-policy-columns',
  description: 'Add the session-policy columns to tenants',
  up: async ctx => {
    await ctx.db.none(
      'ALTER TABLE $1:name.tenants ' +
        'ADD COLUMN IF NOT EXISTS session_idle_min_minutes integer NOT NULL DEFAULT 30, ' +
        'ADD COLUMN IF NOT EXISTS session_idle_max_minutes integer NOT NULL DEFAULT 120, ' +
        'ADD COLUMN IF NOT EXISTS session_absolute_hours integer NOT NULL DEFAULT 12',
      [ctx.schema]
    );
  },
});
