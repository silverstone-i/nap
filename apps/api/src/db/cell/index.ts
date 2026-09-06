/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import type { Database } from 'pg-schemata';

const cellHandle = Symbol('cellDatabase');
/** Nominal identity prevents passing a cell handle to the other database. */
export type CellDatabase = Database & { readonly [cellHandle]: true };

/** Create an independent cell pool; the caller owns connect and close. */
export function createCellDatabase(connectionString: string): CellDatabase {
  return Object.assign(
    createDb({
      connectionString,
      repositories: {},
      pool: { connectionTimeoutMillis: 5000 },
    }),
    { [cellHandle]: true as const }
  );
}
