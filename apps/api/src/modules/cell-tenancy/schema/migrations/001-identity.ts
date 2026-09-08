/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen tenant tables and isolation policies. Called by: explicit cell migration. */
export const migration = defineMigration({
  id: '001-identity',
  up: async ({ db, pgp }) => {
    await db.none(`CREATE FUNCTION cell.stamp_identity_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.updated_at=transaction_timestamp(); IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at AND NEW.deactivated_at IS NOT NULL THEN NEW.deactivated_at=NEW.updated_at; END IF; RETURN NEW; END $$;`);
    await new TableModel(db, pgp, {
      dbSchema: 'cell',
      table: 'tenants',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
        {
          name: 'id',
          type: 'uuid',
          notNull: true,

          immutable: true,
        },
        {
          name: 'tenant_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        {
          name: 'code',
          type: 'text',
          notNull: true,
        },
        {
          name: 'status',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [],
        foreignKeys: [],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE cell.tenants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON cell.tenants FOR EACH ROW EXECUTE FUNCTION cell.stamp_identity_record();
ALTER TABLE cell.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON cell.tenants USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION cell.tenants_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON cell.tenants FOR EACH ROW EXECUTE FUNCTION cell.tenants_keys();`);
    await new TableModel(db, pgp, {
      dbSchema: 'cell',
      table: 'tenant_user_bindings',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
        { name: 'revision', type: 'integer', notNull: true, default: 1 },
        {
          name: 'id',
          type: 'uuid',
          notNull: true,

          immutable: true,
        },
        {
          name: 'tenant_id',
          type: 'uuid',
          notNull: true,
          immutable: true,
        },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'entity_id',
          type: 'uuid',
        },
        {
          name: 'user_type',
          type: 'text',
        },
        {
          name: 'status',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [],
        foreignKeys: [],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE cell.tenant_user_bindings ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON cell.tenant_user_bindings FOR EACH ROW EXECUTE FUNCTION cell.stamp_identity_record();
ALTER TABLE cell.tenant_user_bindings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON cell.tenant_user_bindings USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION cell.tenant_user_bindings_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON cell.tenant_user_bindings FOR EACH ROW EXECUTE FUNCTION cell.tenant_user_bindings_keys();`);
  },
});
