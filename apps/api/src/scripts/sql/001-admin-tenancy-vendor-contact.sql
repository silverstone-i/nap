-- Copyright (c) 2026–present NapSoft, LLC.
-- SPDX-License-Identifier: AGPL-3.0-or-later
--
-- One-off: rename member type 'vendor' to 'vendor_contact' in an existing admin database.
-- Run as nap-admin with the API stopped:
--   psql "<admin connection>" -v ON_ERROR_STOP=1 -f apps/api/src/scripts/sql/001-admin-tenancy-vendor-contact.sql
-- Applies to databases migrated with the original 001-admin-tenancy
-- (hash 8196f27a…). Fresh databases from the edited migration need nothing.

BEGIN;

-- 1. Drop the old unnamed check constraints (exactly one per table).
DO $$
DECLARE
  target text;
  found text[];
BEGIN
  FOREACH target IN ARRAY ARRAY['portal_user_tenants', 'provisioning_jobs'] LOOP
    SELECT array_agg(x.conname) INTO found
      FROM pg_constraint x
      JOIN pg_class c ON c.oid = x.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'admin' AND c.relname = target AND x.contype = 'c'
       AND pg_get_constraintdef(x.oid) LIKE '%''vendor''::text%';
    IF coalesce(array_length(found, 1), 0) <> 1 THEN
      RAISE EXCEPTION 'Expected one vendor check on admin.%, found %', target, coalesce(found, '{}');
    END IF;
    EXECUTE format('ALTER TABLE admin.%I DROP CONSTRAINT %I', target, found[1]);
  END LOOP;
END $$;

-- 2. Memberships: member_type is mutable; protect_record bumps updated_at.
--    Also advance cache revisions for each changed membership and the list
--    (same upsert as CacheRevisions.advance) so cached reads can't serve 'vendor'.
WITH changed AS (
  UPDATE admin.portal_user_tenants
     SET member_type = 'vendor_contact', revision = revision + 1
   WHERE member_type = 'vendor'
  RETURNING id::text AS entity
), keys AS (
  SELECT entity FROM changed
  UNION SELECT 'list' WHERE EXISTS (SELECT 1 FROM changed)
)
INSERT INTO admin.cache_revisions AS revisions (domain, entity, revision, updated_at)
SELECT 'membership', entity, 1, now() FROM keys
ON CONFLICT (domain, entity) DO UPDATE
  SET revision = revisions.revision + 1, updated_at = now();

-- 3. Provisioning jobs: kind is immutable, so bypass protect_record for this update only.
ALTER TABLE admin.provisioning_jobs DISABLE TRIGGER protect_record;
UPDATE admin.provisioning_jobs SET kind = 'vendor_contact' WHERE kind = 'vendor';
ALTER TABLE admin.provisioning_jobs ENABLE TRIGGER protect_record;

-- 4. New checks, unnamed so PostgreSQL assigns the same names a fresh migration does.
ALTER TABLE admin.portal_user_tenants
  ADD CHECK (member_type IS NULL OR member_type IN ('employee', 'client', 'vendor_contact', 'contact'));
ALTER TABLE admin.provisioning_jobs
  ADD CHECK (kind IN ('employee', 'client', 'vendor_contact', 'contact'));

-- 5. Ledger hash for the edited 001-admin-tenancy.
DO $$
BEGIN
  UPDATE admin.schema_migrations
     SET hash = '89745665191d1ccc7079488812d69e207797948b45be68cbf69263bd77ade6f4'
   WHERE schema_name = 'admin' AND module_name = 'admin-tenancy'
     AND migration_id = '001-admin-tenancy'
     AND hash = '8196f27a27f34c4aa51bfff0e0663b16e7b20f7aca3837d5b0df815a53a05496';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger row for 001-admin-tenancy missing or not at the original hash';
  END IF;
END $$;

-- 6. Nothing may still say 'vendor'.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM admin.portal_user_tenants WHERE member_type = 'vendor')
     OR EXISTS (SELECT 1 FROM admin.provisioning_jobs WHERE kind = 'vendor') THEN
    RAISE EXCEPTION 'vendor rows remain';
  END IF;
END $$;

COMMIT;
