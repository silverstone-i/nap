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
  id: '003-cache-revisions',
  up: async ({ db }) => {
    await db.none(`CREATE TABLE cell.cache_revisions (
  tenant_id uuid PRIMARY KEY, revision uuid NOT NULL DEFAULT gen_random_uuid()
);
ALTER TABLE cell.cache_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON cell.cache_revisions
 USING (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid)
 WITH CHECK (tenant_id=NULLIF(current_setting('nap.tenant_id',true),'')::uuid);
INSERT INTO cell.cache_revisions(tenant_id) SELECT tenant_id FROM cell.tenants;
CREATE FUNCTION cell.invalidate_cache() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous uuid; current_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['updated_at','updated_by','created_at','created_by']) =
    (to_jsonb(OLD) - ARRAY['updated_at','updated_by','created_at','created_by']) THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN previous := OLD.tenant_id; END IF;
  IF TG_OP <> 'DELETE' THEN current_id := NEW.tenant_id; END IF;
  INSERT INTO cell.cache_revisions(tenant_id,revision)
    SELECT value, gen_random_uuid()
    FROM (SELECT DISTINCT unnest(ARRAY[previous,current_id]) AS value) ids
    WHERE value IS NOT NULL ORDER BY value
    ON CONFLICT(tenant_id) DO UPDATE SET revision=EXCLUDED.revision;
  RETURN NULL;
END $$;
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON cell.tenant_user_bindings FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON cell.tenants FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
CREATE TRIGGER invalidate_cache AFTER INSERT OR UPDATE OR DELETE ON cell.entitlement_projections FOR EACH ROW EXECUTE FUNCTION cell.invalidate_cache();
`);
  },
});
