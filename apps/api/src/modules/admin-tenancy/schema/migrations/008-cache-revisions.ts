/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { defineMigration } from 'pg-schemata';
/**
 * Does: Installs transactional authorization cache invalidation for this module.
 * Used by: explicit database migration before cache acceleration is enabled.
 */
export const migration = defineMigration({
  id: '008-cache-revisions',
  up: async ({ db }) => {
    await db.none(`CREATE TABLE admin.cache_revisions (
  domain text NOT NULL, entity text NOT NULL,
  revision uuid NOT NULL DEFAULT gen_random_uuid(), PRIMARY KEY(domain, entity)
);
INSERT INTO admin.cache_revisions(domain,entity)
SELECT 'principal',id::text FROM admin.portal_users UNION ALL
SELECT 'tenant',id::text FROM admin.tenants UNION ALL
SELECT 'support','global' UNION ALL SELECT 'routing','global';
CREATE FUNCTION admin.invalidate_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous text; current_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['updated_at','updated_by','created_at','created_by']) =
    (to_jsonb(OLD) - ARRAY['updated_at','updated_by','created_at','created_by']) THEN
    RETURN NEW;
  END IF;
  IF TG_ARGV[1] = 'global' THEN
    current_id := 'global';
  ELSE
    IF TG_OP <> 'INSERT' THEN previous := to_jsonb(OLD)->>TG_ARGV[1]; END IF;
    IF TG_OP <> 'DELETE' THEN current_id := to_jsonb(NEW)->>TG_ARGV[1]; END IF;
  END IF;
  -- Sorting makes owner-changing writes acquire revision rows consistently.
  INSERT INTO admin.cache_revisions(domain,entity,revision)
    SELECT TG_ARGV[0], value, gen_random_uuid()
    FROM (SELECT DISTINCT unnest(ARRAY[previous,current_id]) AS value) ids
    WHERE value IS NOT NULL ORDER BY value
    ON CONFLICT(domain,entity) DO UPDATE SET revision=EXCLUDED.revision;
  RETURN NULL;
END $$;
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.portal_users FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('principal','id');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.portal_user_tenants FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('principal','portal_user_id');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.platform_roles FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('principal','portal_user_id');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.tenants FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('tenant','id');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.module_entitlements FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('tenant','tenant_id');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.cells FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('routing','global');
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON admin.support_policy FOR EACH ROW EXECUTE FUNCTION admin.invalidate_cache('support','global');
`);
  },
});
