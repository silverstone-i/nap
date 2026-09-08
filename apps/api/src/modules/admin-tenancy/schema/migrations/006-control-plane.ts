/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration, TableModel } from 'pg-schemata';

/** Does: Adds the central control plane. Called by: explicit admin migration. */
export const migration = defineMigration({
  id: '006-control-plane',
  up: async ({ db, pgp }) => {
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'cells',
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
          default: 'gen_random_uuid()',
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
          name: 'enabled',
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
            columns: ['code'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [],
        unique: [],
      },
    }).createTable();
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'platform_grants',
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
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'portal_user_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'role',
          type: 'text',
          notNull: true,
        },
        {
          name: 'permission',
          type: 'text',
          notNull: true,
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: ["role IN ('package_admin','support')"],
        indexes: [
          {
            columns: ['portal_user_id', 'permission'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['portal_user_id'],
            references: {
              schema: 'admin',
              table: 'portal_users',
              columns: ['id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        unique: [],
      },
    }).createTable();
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'provisioning_jobs',
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
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'tenant_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'membership_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'record_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'vendor_id',
          type: 'uuid',
        },
        {
          name: 'kind',
          type: 'text',
          notNull: true,
        },
        {
          name: 'stage',
          type: 'text',
          notNull: true,
        },
        {
          name: 'failure_code',
          type: 'text',
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [
          "kind IN ('employee','client','vendor')",
          "stage IN ('pending','complete','failed')",
        ],
        indexes: [
          {
            columns: ['membership_id'],
            unique: true,
            where: 'deactivated_at IS NULL',
          },
        ],
        foreignKeys: [
          {
            type: 'ForeignKey',
            columns: ['tenant_id'],
            references: {
              schema: 'admin',
              table: 'tenants',
              columns: ['id'],
            },
            onDelete: 'RESTRICT',
          },
          {
            type: 'ForeignKey',
            columns: ['membership_id'],
            references: {
              schema: 'admin',
              table: 'portal_user_tenants',
              columns: ['id'],
            },
            onDelete: 'RESTRICT',
          },
        ],
        unique: [],
      },
    }).createTable();
    await new TableModel(db, pgp, {
      dbSchema: 'admin',
      table: 'managed_events',
      hasAuditFields: {
        enabled: true,
        userFields: {
          type: 'uuid',
        },
      },
      softDelete: false,
      columns: [
        {
          name: 'id',
          type: 'uuid',
          notNull: true,
          default: 'gen_random_uuid()',
          immutable: true,
        },
        {
          name: 'operator_id',
          type: 'uuid',
          notNull: true,
        },
        {
          name: 'effective_user_id',
          type: 'uuid',
        },
        {
          name: 'target_id',
          type: 'uuid',
        },
        {
          name: 'event',
          type: 'text',
          notNull: true,
        },
        {
          name: 'reason',
          type: 'text',
          notNull: true,
        },
        {
          name: 'session_id',
          type: 'uuid',
        },
      ],
      constraints: {
        primaryKey: ['id'],
        checks: [],
        indexes: [],
        foreignKeys: [],
        unique: [],
      },
    }).createTable();
    await db.none(`
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM admin.portal_user_tenants m JOIN admin.portal_users u ON u.id=m.portal_user_id WHERE NOT u.is_root) THEN
 RAISE EXCEPTION 'Unexplained non-root memberships require explicit reconciliation'; END IF;
END $$;
ALTER TABLE admin.tenants ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE admin.portal_user_tenants ADD COLUMN revision integer NOT NULL DEFAULT 1;
ALTER TABLE admin.tenants ADD COLUMN tier text NOT NULL DEFAULT 'starter' CHECK(tier IN ('starter','growth','enterprise')),
 ADD COLUMN cell_id uuid REFERENCES admin.cells(id) ON DELETE RESTRICT, ADD COLUMN provisioned boolean NOT NULL DEFAULT false;
ALTER TABLE admin.portal_users ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE admin.portal_user_tenants ADD COLUMN user_type text CHECK(user_type IN ('employee','client','vendor')),
 ADD COLUMN entity_id uuid, ADD COLUMN ready boolean NOT NULL DEFAULT false;
UPDATE admin.portal_user_tenants SET ready=true WHERE portal_user_id IN (SELECT id FROM admin.portal_users WHERE is_root);
CREATE UNIQUE INDEX membership_record ON admin.portal_user_tenants(tenant_id,entity_id) WHERE deactivated_at IS NULL;
ALTER TABLE admin.sessions ALTER COLUMN tenant_id DROP NOT NULL,
 ADD COLUMN access_mode text CHECK(access_mode IN ('access','impersonation')),
 ADD COLUMN effective_user_id uuid REFERENCES admin.portal_users(id) ON DELETE RESTRICT, ADD COLUMN access_reason text;
CREATE FUNCTION admin.control_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Managed audit is append only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER managed_events_immutable BEFORE UPDATE OR DELETE ON admin.managed_events FOR EACH ROW EXECUTE FUNCTION admin.control_immutable();
CREATE FUNCTION admin.guard_root_membership() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM admin.portal_users WHERE (id=NEW.portal_user_id OR id=OLD.portal_user_id) AND is_root) THEN
  IF TG_OP='DELETE' OR NEW.status <> 'active' OR NEW.deactivated_at IS NOT NULL OR NOT NEW.ready OR (TG_OP='UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.portal_user_id IS DISTINCT FROM OLD.portal_user_id OR NEW.status <> 'active' OR NEW.deactivated_at IS NOT NULL OR NEW.user_type IS NOT NULL OR NEW.entity_id IS NOT NULL)) OR
  (TG_OP='INSERT' AND (NEW.user_type IS NOT NULL OR NEW.entity_id IS NOT NULL OR EXISTS(SELECT 1 FROM admin.portal_user_tenants WHERE portal_user_id=NEW.portal_user_id))) THEN
   RAISE EXCEPTION 'Root membership is immutable' USING ERRCODE='23514'; END IF;
 END IF; IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;
CREATE TRIGGER root_membership BEFORE INSERT OR UPDATE OR DELETE ON admin.portal_user_tenants FOR EACH ROW EXECUTE FUNCTION admin.guard_root_membership();

CREATE INDEX session_effective_user ON admin.sessions(effective_user_id);
CREATE INDEX tenant_cell ON admin.tenants(cell_id);
CREATE INDEX job_tenant ON admin.provisioning_jobs(tenant_id);
ALTER TABLE admin.cells ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE admin.platform_grants ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE admin.provisioning_jobs ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE admin.managed_events ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.cells FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();
CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.platform_grants FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();
CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.provisioning_jobs FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();
`);
  },
});
