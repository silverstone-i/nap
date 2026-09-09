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
  id: '003-cache-invalidation',
  up: async ({ db }) => {
    await db.none(`CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON app.roles FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON app.role_assignments FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON app.assignment_companies FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
`);
  },
});
