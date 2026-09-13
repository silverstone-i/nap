/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { Database } from 'pg-schemata';
/** Does: Reads the immutable physical database identity. Called by: operator readiness verification on the running API pool. */
export async function physicalIdentity(db: Pick<Database, 'one'>) {
  return db.one<{
    id: string;
    environment: string;
    database_name: string;
    operation_id: string;
    actual: string;
  }>('SELECT *,current_database() AS actual FROM cell.physical_identity');
}
