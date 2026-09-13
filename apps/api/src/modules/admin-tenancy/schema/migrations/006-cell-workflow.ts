/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration } from 'pg-schemata';
/**
 * Does: Preserves cell identities while replacing labels and adding resumable execution state.
 * Used by: admin migrations before the Register cell workflow starts.
 */
export const migration = defineMigration({
  id: '006-cell-workflow',
  up: async ({ db }) => {
    await db.none(`
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM admin.cells c LEFT JOIN admin.cell_provisioning p ON p.cell_id=c.id
 WHERE p.cell_id IS NULL OR p.database_name !~ '^nap_(dev|test|prod)_cell_[a-z0-9_]+$') THEN
 RAISE EXCEPTION 'Cell database names require verified provisioning metadata before migration';
 END IF;
END $$;
ALTER TABLE admin.cells ADD COLUMN database_name text;
UPDATE admin.cells c SET database_name=p.database_name FROM admin.cell_provisioning p WHERE p.cell_id=c.id;
ALTER TABLE admin.cells ALTER COLUMN database_name SET NOT NULL;
ALTER TABLE admin.cells DROP COLUMN code, DROP COLUMN name;
CREATE UNIQUE INDEX cells_database_name_live ON admin.cells(database_name) WHERE deactivated_at IS NULL;
ALTER TABLE admin.cell_provisioning
 ADD COLUMN status text NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','queued','running','failed','completed')),
 ADD COLUMN requested_action text NOT NULL DEFAULT 'provision' CHECK(requested_action IN ('provision','activate')),
 ADD COLUMN initiated_by uuid REFERENCES admin.portal_users(id),
 ADD COLUMN started_at timestamptz,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN completed_at timestamptz;
UPDATE admin.cell_provisioning SET status=CASE WHEN stage='enabled' THEN 'completed' ELSE 'idle' END;
GRANT SELECT,INSERT,UPDATE ON admin.cell_provisioning TO nap_app;
`);
  },
});
