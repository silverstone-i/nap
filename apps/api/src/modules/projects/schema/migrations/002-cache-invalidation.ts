/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration } from 'pg-schemata';
/**
 * Does: Installs transactional authorization cache invalidation for this module.
 * Used by: explicit database migration before cache acceleration is enabled.
 */
export const migration = defineMigration({
  id: '002-cache-invalidation',
  up: async ({ db }) => {
    await db.none(
      `CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON app.assignment_projects FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();`
    );
  },
});
