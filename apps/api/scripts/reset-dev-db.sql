-- Copyright (c) 2026–present Ian Silverstone.
-- SPDX-License-Identifier: AGPL-3.0-or-later

-- Drops every application schema in nap_dev so the next `db:bootstrap` runs
-- from migration 0001. pg-schemata keeps its `schema_migrations` ledger inside
-- each target schema, so dropping the schema drops its migration history with
-- it — there is no global ledger to clean up separately.
--
-- Run with:
--   psql "$DATABASE_URL_DEV" -v ON_ERROR_STOP=1 -f apps/api/scripts/reset-dev-db.sql
--
-- Everything is one DO block on purpose: the database-name guard raises before
-- any DROP runs, and a raised exception rolls the whole block back.

DO $$
DECLARE
  target_db CONSTANT text := 'nap_dev';
  victim    text;
  dropped   int := 0;
BEGIN
  IF current_database() <> target_db THEN
    RAISE EXCEPTION
      'refusing to run: connected to "%", expected "%"',
      current_database(), target_db;
  END IF;

  -- Application schemas: admin, the root tenant (nap), and every per-tenant
  -- schema. Postgres internals and extension-owned schemas are left alone.
  FOR victim IN
    SELECT n.nspname
    FROM pg_namespace n
    LEFT JOIN pg_depend d
      ON d.objid = n.oid
     AND d.classid = 'pg_namespace'::regclass
     AND d.deptype = 'e'
    WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'public')
      AND n.nspname NOT LIKE 'pg\_toast%'
      AND n.nspname NOT LIKE 'pg\_temp%'
      AND d.objid IS NULL
    ORDER BY n.nspname
  LOOP
    EXECUTE format('DROP SCHEMA %I CASCADE', victim);
    dropped := dropped + 1;
    RAISE NOTICE 'dropped schema %', victim;
  END LOOP;

  -- public holds nothing the app owns, but reset it so a stray object created
  -- by hand does not survive a "clean" database.
  DROP SCHEMA public CASCADE;
  CREATE SCHEMA public;
  EXECUTE format('ALTER SCHEMA public OWNER TO %I', current_user);
  GRANT USAGE ON SCHEMA public TO PUBLIC;

  RAISE NOTICE 'reset complete: % application schema(s) dropped, public recreated', dropped;
END $$;
