/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * PL/pgSQL bodies of the trigger functions installed by migration
 * `001-admin-tenancy`, keyed by function name. `verifyAdmin` compares these
 * against `pg_proc.prosrc`, so each string must match the migration exactly.
 */
export const functionBodies = {
  protect_record:
    "\nDECLARE col text;\nBEGIN\n  FOREACH col IN ARRAY TG_ARGV LOOP\n    IF to_jsonb(NEW)->col IS DISTINCT FROM to_jsonb(OLD)->col THEN\n      RAISE EXCEPTION 'Immutable field' USING ERRCODE='23514';\n    END IF;\n  END LOOP;\n  IF to_jsonb(NEW) ? 'updated_at' THEN NEW.updated_at = clock_timestamp(); END IF;\n  RETURN NEW;\nEND ",
  protect_membership:
    "\nDECLARE owner_tenant boolean;\nBEGIN\n  IF TG_OP='DELETE' THEN\n    SELECT is_napsoft INTO owner_tenant FROM admin.tenants WHERE id=OLD.tenant_id FOR UPDATE;\n    IF OLD.member_type IS NULL AND owner_tenant THEN\n      RAISE EXCEPTION 'Protected Napsoft membership' USING ERRCODE='23514';\n    END IF;\n    RETURN OLD;\n  END IF;\n  SELECT is_napsoft INTO owner_tenant FROM admin.tenants WHERE id=NEW.tenant_id FOR UPDATE;\n  IF NEW.member_type IS NULL AND NOT coalesce(owner_tenant,false) THEN\n    RAISE EXCEPTION 'Napsoft membership required' USING ERRCODE='23514';\n  END IF;\n  IF TG_OP='UPDATE' AND OLD.member_type IS NULL\n    AND EXISTS(SELECT 1 FROM admin.tenants WHERE id=OLD.tenant_id AND is_napsoft)\n    AND (NEW.portal_user_id IS DISTINCT FROM OLD.portal_user_id\n      OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.member_type IS DISTINCT FROM OLD.member_type\n      OR NEW.member_id IS DISTINCT FROM OLD.member_id OR NEW.ready IS DISTINCT FROM OLD.ready\n      OR NEW.status IS DISTINCT FROM OLD.status OR NEW.deactivated_at IS DISTINCT FROM OLD.deactivated_at) THEN\n    RAISE EXCEPTION 'Protected Napsoft membership' USING ERRCODE='23514';\n  END IF;\n  RETURN NEW;\nEND ",
  protect_cell_assignment:
    "\nBEGIN\n  IF OLD.cell_id IS NOT NULL AND NEW.cell_id IS DISTINCT FROM OLD.cell_id\n    AND (OLD.provisioned OR NEW.provisioned OR EXISTS(SELECT 1 FROM admin.portal_user_tenants WHERE tenant_id=OLD.id)) THEN\n    RAISE EXCEPTION 'Cell assignment protected' USING ERRCODE='23514';\n  END IF;\n  RETURN NEW;\nEND ",
  protect_event:
    "\nBEGIN RAISE EXCEPTION 'Append-only event' USING ERRCODE='23514'; END ",
};
