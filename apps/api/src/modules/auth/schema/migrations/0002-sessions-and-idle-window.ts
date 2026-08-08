/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration } from 'pg-schemata';
import type { Migration, TableModel } from 'pg-schemata';

/**
 * PRD 0004: the sessions table and the user's idle-window preference.
 * `0001-create-tables` already gives both to fresh schemas (it builds every
 * declared model), so each statement here is idempotent — this migration
 * exists for databases whose tracking table marks 0001 as applied.
 * Schema comes from the context, never a literal (RULES/db-and-migrations.md).
 */
export const sessionsAndIdleWindow: Migration = defineMigration({
  id: '0002-sessions-and-idle-window',
  description:
    'Create admin.sessions and add portal_users.session_idle_minutes',
  up: async ctx => {
    await (ctx.models.sessions as TableModel).createTable();
    await ctx.db.none(
      'ALTER TABLE $1:name.portal_users ADD COLUMN IF NOT EXISTS session_idle_minutes integer NOT NULL DEFAULT 30',
      [ctx.schema]
    );
  },
});
