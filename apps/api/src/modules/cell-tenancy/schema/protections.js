/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * PL/pgSQL bodies of the trigger functions installed by migration
 * `001-cell-tenancy`, keyed by function name. `verifyCell` compares these
 * against `pg_proc.prosrc`, so each string must match the migration exactly.
 */
export const functionBodies = {
  protect_record:
    "\nDECLARE col text;\nBEGIN\n  FOREACH col IN ARRAY TG_ARGV LOOP\n    IF to_jsonb(NEW)->col IS DISTINCT FROM to_jsonb(OLD)->col THEN\n      RAISE EXCEPTION 'Immutable field' USING ERRCODE='23514';\n    END IF;\n  END LOOP;\n  IF to_jsonb(NEW) ? 'updated_at' THEN NEW.updated_at = clock_timestamp(); END IF;\n  RETURN NEW;\nEND ",
};
