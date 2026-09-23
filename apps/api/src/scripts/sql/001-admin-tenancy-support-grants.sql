-- Copyright (c) 2026–present NapSoft, LLC.
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- One-off: add admin.support_grants and the 'break_glass' session access mode
-- to an existing admin database (M0001-13 schema).
-- Run as nap-admin with the API stopped, after 001-admin-tenancy-vendor-contact.sql:
--   psql "<admin connection>" -v ON_ERROR_STOP=1 -f apps/api/src/scripts/sql/001-admin-tenancy-support-grants.sql
-- Applies to databases at 001-admin-tenancy hash 89745665…. Fresh databases
-- from the edited migration need nothing.

BEGIN;

-- 1. Require the post-vendor-contact baseline.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin.schema_migrations
     WHERE schema_name = 'admin' AND module_name = 'admin-tenancy'
       AND migration_id = '001-admin-tenancy'
       AND hash = '89745665191d1ccc7079488812d69e207797948b45be68cbf69263bd77ade6f4'
  ) THEN
    RAISE EXCEPTION '001-admin-tenancy is not at hash 89745665…: this script already ran, or 001-admin-tenancy-vendor-contact.sql has not';
  END IF;
END $$;

-- 2. Sessions: replace the two access-mode checks (found by definition).
DO $$
DECLARE
  found text[];
BEGIN
  SELECT array_agg(x.conname) INTO found
    FROM pg_constraint x
   WHERE x.conrelid = 'admin.sessions'::regclass AND x.contype = 'c'
     AND pg_get_constraintdef(x.oid) LIKE '%''support''::text%';
  IF coalesce(array_length(found, 1), 0) <> 2 THEN
    RAISE EXCEPTION 'Expected two access-mode checks on admin.sessions, found %', coalesce(found, '{}');
  END IF;
  EXECUTE format('ALTER TABLE admin.sessions DROP CONSTRAINT %I, DROP CONSTRAINT %I', found[1], found[2]);
END $$;

ALTER TABLE admin.sessions
  ADD CONSTRAINT sessions_access_mode_check
    CHECK (access_mode IN ('normal', 'support', 'break_glass')),
  ADD CONSTRAINT sessions_check
    CHECK ((access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL) OR (access_mode = 'break_glass' AND tenant_id IS NOT NULL AND effective_user_id IS NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL));

-- 3. Support grants, matching a fresh 001-admin-tenancy catalog exactly.
CREATE TABLE admin.support_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    operator_id uuid NOT NULL,
    effective_user_id uuid NOT NULL,
    reason character varying(512) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    session_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT support_grants_pkey PRIMARY KEY (id),
    CONSTRAINT support_grants_check CHECK ((operator_id <> effective_user_id)),
    CONSTRAINT support_grants_check1 CHECK ((((status = 'pending'::text) AND (decided_by IS NULL) AND (decided_at IS NULL) AND (session_id IS NULL)) OR ((status = ANY (ARRAY['approved'::text, 'denied'::text])) AND (decided_by IS NOT NULL) AND (decided_at IS NOT NULL) AND (session_id IS NULL)) OR ((status = 'used'::text) AND (decided_by IS NOT NULL) AND (decided_at IS NOT NULL) AND (session_id IS NOT NULL)) OR ((status = ANY (ARRAY['expired'::text, 'cancelled'::text])) AND (session_id IS NULL)))),
    CONSTRAINT support_grants_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'denied'::text, 'expired'::text, 'used'::text, 'cancelled'::text]))),
    CONSTRAINT fk_support_grants_473e77 FOREIGN KEY (tenant_id) REFERENCES admin.tenants(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_grants_f6d071 FOREIGN KEY (operator_id) REFERENCES admin.portal_users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_grants_3c771f FOREIGN KEY (effective_user_id) REFERENCES admin.portal_users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_grants_516b99 FOREIGN KEY (decided_by) REFERENCES admin.portal_users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_support_grants_1594a1 FOREIGN KEY (session_id) REFERENCES admin.sessions(id) ON DELETE RESTRICT
);
CREATE INDEX idx_support_grants_effective_user_id_status ON admin.support_grants USING btree (effective_user_id, status);
CREATE INDEX idx_support_grants_expires_at ON admin.support_grants USING btree (expires_at);
CREATE INDEX idx_support_grants_tenant_id_status ON admin.support_grants USING btree (tenant_id, status);
CREATE UNIQUE INDEX support_grants_open_request ON admin.support_grants USING btree (operator_id, tenant_id, effective_user_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text]));
CREATE TRIGGER protect_record BEFORE UPDATE ON admin.support_grants FOR EACH ROW EXECUTE FUNCTION admin.protect_record('id', 'tenant_id', 'operator_id', 'effective_user_id', 'reason', 'expires_at');
ALTER TABLE admin.support_grants DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin.support_grants FROM PUBLIC, "nap-app";
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.support_grants TO "nap-app";

-- 4. Ledger hash for the edited 001-admin-tenancy.
UPDATE admin.schema_migrations
   SET hash = '3887315b763acf420bfc2c92d334c2c0c982c3d1e42d703821f86bb6376bc856'
 WHERE schema_name = 'admin' AND module_name = 'admin-tenancy'
   AND migration_id = '001-admin-tenancy';

COMMIT;
