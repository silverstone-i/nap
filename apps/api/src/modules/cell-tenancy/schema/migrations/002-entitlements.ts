/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen authorization tables. Called by: explicit database migration. */
export const migration = defineMigration({
  id: '002-entitlements',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'cell',
      table: 'entitlement_projections',
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
        { name: 'module', type: 'text', notNull: true },
        { name: 'enabled', type: 'boolean', notNull: true },
        { name: 'revision', type: 'integer', notNull: true },
      ],
      constraints: {
        primaryKey: ['id'],
        unique: [
          ['tenant_id', 'id'],
          ['tenant_id', 'module'],
        ],
        foreignKeys: [],
        checks: [],
        indexes: [],
      },
    }).createTable();
    await db.none(
      `ALTER TABLE cell.entitlement_projections ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;ALTER TABLE cell.entitlement_projections ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_scope ON cell.entitlement_projections USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);CREATE FUNCTION cell.entitlement_projections_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN RAISE EXCEPTION 'Immutable key' USING ERRCODE='23514'; END IF; NEW.updated_at=transaction_timestamp(); RETURN NEW; END $$; CREATE TRIGGER stamp_record BEFORE UPDATE ON cell.entitlement_projections FOR EACH ROW EXECUTE FUNCTION cell.entitlement_projections_stamp();`
    );
  },
});
