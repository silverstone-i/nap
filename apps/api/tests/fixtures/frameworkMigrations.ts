/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration } from 'pg-schemata';
import type { NapModuleDescriptor } from '../../src/db/modules.js';

/**
 * Does: Lists the frozen migration that creates the framework test table
 * with its row-level security policies.
 * Used by: frameworkDatabase, and never a production registry.
 */
export const frameworkModules: readonly NapModuleDescriptor[] = [
  {
    name: 'framework_record',
    databaseTarget: 'cell',
    schema: 'app',
    migrations: [
      defineMigration({
        id: '001-framework-record',
        up: async ({ db }) => {
          await db.none(`
        CREATE TABLE app.framework_record (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL,
          code varchar(16) NOT NULL,
          name varchar(128) NOT NULL,
          quantity integer,
          parent_id uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          created_by uuid,
          updated_at timestamptz NOT NULL DEFAULT now(),
          updated_by uuid,
          deactivated_at timestamptz,
          UNIQUE (tenant_id, id),
          UNIQUE (tenant_id, code),
          FOREIGN KEY (tenant_id, parent_id)
            REFERENCES app.framework_record (tenant_id, id) ON DELETE RESTRICT
        );
        CREATE INDEX framework_record_parent ON app.framework_record (tenant_id, parent_id);
        CREATE FUNCTION app.framework_record_immutable() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
              RAISE EXCEPTION 'Framework record keys are immutable' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
          END $$;
        CREATE TRIGGER framework_record_immutable BEFORE UPDATE ON app.framework_record
          FOR EACH ROW EXECUTE FUNCTION app.framework_record_immutable();
        ALTER TABLE app.framework_record ENABLE ROW LEVEL SECURITY;
        CREATE POLICY framework_record_tenant ON app.framework_record
          USING (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid);
      `);
        },
      }),
    ],
  },
];
