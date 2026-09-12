/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration, TableModel } from 'pg-schemata';
/** Does: Creates the frozen 004-provisioning-audit baseline. Called by: the admin migration runner. */
export const migration = defineMigration({
  id: '004-provisioning-audit',
  up: async ({ db, pgp }) => {
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
    await db.none(
      `ALTER TABLE admin.provisioning_jobs ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(
      `CREATE TRIGGER stamp_record BEFORE UPDATE ON admin.provisioning_jobs FOR EACH ROW EXECUTE FUNCTION admin.stamp_auth_record();`
    );
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
    await db.none(
      `ALTER TABLE admin.managed_events ALTER COLUMN created_at SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;`
    );
    await db.none(`CREATE FUNCTION admin.control_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 RAISE EXCEPTION 'Managed audit is append only' USING ERRCODE='23514'; END $$;CREATE TRIGGER managed_events_immutable BEFORE UPDATE OR DELETE ON admin.managed_events FOR EACH ROW EXECUTE FUNCTION admin.control_immutable();`);
  },
});
