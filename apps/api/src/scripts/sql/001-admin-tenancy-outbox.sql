-- Copyright (c) 2026–present NapSoft, LLC.
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- One-off: add admin.outbox to an existing admin database (W0003 schema).
-- Run as nap-admin with the API stopped, after 001-admin-tenancy-support-grants.sql:
--   psql "<admin connection>" -v ON_ERROR_STOP=1 -f apps/api/src/scripts/sql/001-admin-tenancy-outbox.sql
-- Applies to databases at 001-admin-tenancy hash 3887315b…. Fresh databases
-- from the edited migration need nothing.

BEGIN;

-- 1. Require the post-support-grants baseline.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM admin.schema_migrations
     WHERE schema_name = 'admin' AND module_name = 'admin-tenancy'
       AND migration_id = '001-admin-tenancy'
       AND hash = '3887315b763acf420bfc2c92d334c2c0c982c3d1e42d703821f86bb6376bc856'
  ) THEN
    RAISE EXCEPTION '001-admin-tenancy is not at hash 3887315b…: this script already ran, or 001-admin-tenancy-support-grants.sql has not';
  END IF;
END $$;

-- 2. Outbox, matching a fresh 001-admin-tenancy catalog exactly.
CREATE TABLE admin.outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    topic text NOT NULL,
    entity_id uuid NOT NULL,
    revision integer NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    delivered_at timestamp with time zone,
    failure_code character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT outbox_pkey PRIMARY KEY (id),
    CONSTRAINT outbox_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT outbox_check CHECK ((((status = 'delivered'::text) AND (delivered_at IS NOT NULL) AND (failure_code IS NULL)) OR ((status <> 'delivered'::text) AND (delivered_at IS NULL)))),
    CONSTRAINT outbox_revision_check CHECK ((revision > 0)),
    CONSTRAINT outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'delivered'::text, 'failed'::text]))),
    CONSTRAINT outbox_topic_check CHECK ((topic = ANY (ARRAY['tenant'::text, 'membership'::text, 'entitlement'::text]))),
    CONSTRAINT fk_outbox_7c3043 FOREIGN KEY (tenant_id) REFERENCES admin.tenants(id) ON DELETE RESTRICT
);
CREATE INDEX idx_outbox_status_next_attempt_at ON admin.outbox USING btree (status, next_attempt_at);
CREATE INDEX idx_outbox_tenant_id_status ON admin.outbox USING btree (tenant_id, status);
CREATE UNIQUE INDEX outbox_change ON admin.outbox USING btree (topic, entity_id, revision);
CREATE TRIGGER protect_record BEFORE UPDATE ON admin.outbox FOR EACH ROW EXECUTE FUNCTION admin.protect_record('id', 'tenant_id', 'topic', 'entity_id', 'revision', 'payload');
ALTER TABLE admin.outbox DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin.outbox FROM PUBLIC, "nap-app";
GRANT SELECT, INSERT, UPDATE, DELETE ON admin.outbox TO "nap-app";

-- 3. Ledger hash for the edited 001-admin-tenancy.
UPDATE admin.schema_migrations
   SET hash = '56bb65cfe56d2c802806210821c90a834c959d38e36345fadfe7711545fc707b'
 WHERE schema_name = 'admin' AND module_name = 'admin-tenancy'
   AND migration_id = '001-admin-tenancy';

COMMIT;
