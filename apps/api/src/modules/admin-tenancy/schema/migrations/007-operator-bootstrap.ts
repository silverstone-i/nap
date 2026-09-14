/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration } from 'pg-schemata';
/**
 * Does: Adds saved progress for newly created operator accounts.
 * Used by: admin migrations before greenfield bootstrap.
 * Why: ADR 0015 forbids enrolling existing installations.
 */
export const migration = defineMigration({
  id: '007-operator-bootstrap',
  up: async ({ db }) => {
    await db.none(`
CREATE TABLE admin.operator_bootstrap (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 singleton boolean NOT NULL DEFAULT true UNIQUE CHECK(singleton),
 tenant_id uuid NOT NULL REFERENCES admin.tenants(id),
 root_id uuid NOT NULL REFERENCES admin.portal_users(id),
 cell_id uuid REFERENCES admin.cells(id),
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','queued','running','failed','completed')),
 failure_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 CHECK((status='waiting' AND cell_id IS NULL) OR (status<>'waiting' AND cell_id IS NOT NULL))
);
GRANT SELECT,INSERT,UPDATE ON admin.operator_bootstrap TO nap_app;
`);
  },
});
