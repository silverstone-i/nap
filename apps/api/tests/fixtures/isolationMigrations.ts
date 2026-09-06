/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration } from 'pg-schemata';
import type { NapModuleDescriptor } from '../../src/db/modules.js';

/** Frozen isolation DDL: supplied only by tests, never production registries. */
export const isolationModules: readonly NapModuleDescriptor[] = [
  {
    name: 'isolation_probe',
    databaseTarget: 'cell',
    schema: 'app',
    migrations: [
      defineMigration({
        id: '001-isolation-probe',
        up: async ({ db }) => {
          await db.none(`
        CREATE TABLE app.isolation_probe (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL,
          code text NOT NULL,
          parent_id uuid,
          payload text NOT NULL DEFAULT '',
          UNIQUE (tenant_id, id),
          UNIQUE (tenant_id, code),
          FOREIGN KEY (tenant_id, parent_id)
            REFERENCES app.isolation_probe (tenant_id, id) ON DELETE RESTRICT
        );
        CREATE INDEX isolation_probe_parent ON app.isolation_probe (tenant_id, parent_id);
        CREATE FUNCTION app.isolation_probe_immutable() RETURNS trigger
          LANGUAGE plpgsql AS $$ BEGIN
            IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.id IS DISTINCT FROM OLD.id THEN
              RAISE EXCEPTION 'Isolation probe keys are immutable' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
          END $$;
        CREATE TRIGGER isolation_probe_immutable BEFORE UPDATE ON app.isolation_probe
          FOR EACH ROW EXECUTE FUNCTION app.isolation_probe_immutable();
        ALTER TABLE app.isolation_probe ENABLE ROW LEVEL SECURITY;
        CREATE POLICY isolation_probe_tenant ON app.isolation_probe
          USING (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid)
          WITH CHECK (tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid);
      `);
        },
      }),
    ],
  },
  {
    name: 'isolation_reporting',
    databaseTarget: 'cell',
    schema: 'reporting',
    migrations: [
      defineMigration({
        id: '001-isolation-report',
        up: async ({ db }) => {
          await db.none(`CREATE VIEW reporting.isolation_probe WITH (security_invoker = true)
        AS SELECT id, tenant_id, code, payload FROM app.isolation_probe`);
        },
      }),
    ],
  },
];
