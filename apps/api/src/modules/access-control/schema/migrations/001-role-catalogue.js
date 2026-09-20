/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

export const migration = defineMigration({
  id: '001-access-control-role-catalogue',
  up: async ({ db, pgp }) => {
    const schema = {
      dbSchema: 'app',
      table: 'roles',
      hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
      softDelete: true,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
        { name: 'code', type: 'text', notNull: true, immutable: true },
        { name: 'name', type: 'text', notNull: true },
        { name: 'system_role', type: 'text', immutable: true },
        {
          name: 'capabilities',
          type: 'jsonb',
          notNull: true,
          default: "'[]'::jsonb",
        },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [['tenant_id', 'id']],
        checks: [
          "code ~ '^[a-z][a-z0-9_]*$'",
          "system_role IS NULL OR (system_role IN ('platform_admin','support','tenant_admin') AND code=system_role)",
          "system_role IS NOT NULL OR code NOT IN ('platform_admin','support','tenant_admin')",
          "jsonb_typeof(capabilities)='array'",
        ],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
          {
            columns: ['tenant_id', 'system_role'],
            unique: true,
            where: 'system_role IS NOT NULL AND deactivated_at IS NULL',
          },
        ],
      },
    };
    await new TableModel(db, pgp, schema).createTable();
    await db.none(`
CREATE FUNCTION app.protect_system_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.system_role IS NOT NULL AND current_user <> 'nap-admin' THEN
    RAISE EXCEPTION 'Protected system role' USING ERRCODE='23514';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER protect_system_role BEFORE UPDATE OR DELETE ON app.roles
  FOR EACH ROW EXECUTE FUNCTION app.protect_system_role();
ALTER TABLE app.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.roles
  USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
REVOKE ALL ON app.roles FROM PUBLIC, "nap-app";
GRANT SELECT, INSERT, UPDATE, DELETE ON app.roles TO "nap-app";
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO "nap-app";
`);
  },
});
