/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import type { Database } from 'pg-schemata';

const adminHandle = Symbol('adminDatabase');
/** Nominal identity prevents passing a admin handle to the other database. */
export type AdminDatabase = Database & { readonly [adminHandle]: true };

/** Create an independent admin pool; the caller owns connect and close. */
export function createAdminDatabase(connectionString: string): AdminDatabase {
  return Object.assign(
    createDb({
      connectionString,
      repositories: {},
      pool: { connectionTimeoutMillis: 5000 },
    }),
    { [adminHandle]: true as const }
  );
}
