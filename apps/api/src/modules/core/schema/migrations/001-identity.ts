/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates frozen tenant tables and isolation policies. Called by: explicit cell migration. */
export const migration = defineMigration({
  id: '001-identity',
  up: async ({ db, pgp }) => {
    await db.none(`CREATE FUNCTION app.stamp_identity_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.updated_at=transaction_timestamp(); IF NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at AND NEW.deactivated_at IS NOT NULL THEN NEW.deactivated_at=NEW.updated_at; END IF; RETURN NEW; END $$;`);
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'employees',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
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
          name: 'name',
          type: 'text',
          notNull: true,
        },
        {
          name: 'email',
          type: 'text',
          notNull: true,
        },
        {
          name: 'is_app_user',
          type: 'boolean',
          notNull: true,
          default: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE app.employees ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON app.employees FOR EACH ROW EXECUTE FUNCTION app.stamp_identity_record();
ALTER TABLE app.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.employees USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION app.employees_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON app.employees FOR EACH ROW EXECUTE FUNCTION app.employees_keys();`);
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'clients',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
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
          name: 'name',
          type: 'text',
          notNull: true,
        },
        {
          name: 'email',
          type: 'text',
          notNull: true,
        },
        {
          name: 'is_app_user',
          type: 'boolean',
          notNull: true,
          default: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE app.clients ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON app.clients FOR EACH ROW EXECUTE FUNCTION app.stamp_identity_record();
ALTER TABLE app.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.clients USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION app.clients_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON app.clients FOR EACH ROW EXECUTE FUNCTION app.clients_keys();`);
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'vendors',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
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
          name: 'name',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE app.vendors ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON app.vendors FOR EACH ROW EXECUTE FUNCTION app.stamp_identity_record();
ALTER TABLE app.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.vendors USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION app.vendors_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON app.vendors FOR EACH ROW EXECUTE FUNCTION app.vendors_keys();`);
    await new TableModel(db, pgp, {
      dbSchema: 'app',
      table: 'vendor_contacts',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: true,
      columns: [
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
          name: 'name',
          type: 'text',
          notNull: true,
        },
        {
          name: 'email',
          type: 'text',
          notNull: true,
        },
        {
          name: 'is_app_user',
          type: 'boolean',
          notNull: true,
          default: true,
        },
        {
          name: 'vendor_id',
          type: 'uuid',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [
          {
            columns: ['tenant_id', 'code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id', 'vendor_id'],
            references: {
              schema: 'app',
              table: 'vendors',
              columns: ['tenant_id', 'id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        unique: [['tenant_id', 'id']],
      },
    }).createTable();
    await db.none(`ALTER TABLE app.vendor_contacts ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON app.vendor_contacts FOR EACH ROW EXECUTE FUNCTION app.stamp_identity_record();
ALTER TABLE app.vendor_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON app.vendor_contacts USING(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid) WITH CHECK(tenant_id = NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
CREATE FUNCTION app.vendor_contacts_keys() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Immutable tenant key' USING ERRCODE='23514'; END IF; RETURN NEW; END $$;
CREATE TRIGGER immutable_keys BEFORE UPDATE ON app.vendor_contacts FOR EACH ROW EXECUTE FUNCTION app.vendor_contacts_keys();`);
    await db.none(
      'CREATE INDEX vendor_contact_vendor ON app.vendor_contacts(tenant_id,vendor_id)'
    );
  },
});
