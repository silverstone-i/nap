/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import type {
  Database,
  DatabaseConfig,
  RepositoryCtor,
  RepositoryInstances,
} from 'pg-schemata';

const cellHandle = Symbol('cellDatabase');
/** Nominal identity prevents passing a cell handle to the other database. */
export type CellDatabase<R = Record<never, never>> = Database<R> & {
  readonly [cellHandle]: true;
};

/** Create an independent cell pool; the caller owns connect and close. */
export function createCellDatabase<
  const C extends Record<string, RepositoryCtor> = Record<never, never>,
>(
  connectionString: string,
  options: Pick<DatabaseConfig<C>, 'repositories' | 'pool'> = {}
): CellDatabase<RepositoryInstances<C>> {
  return Object.assign(
    createDb({
      connectionString,
      repositories: options.repositories,
      pool: { connectionTimeoutMillis: 5000, ...options.pool },
    }),
    { [cellHandle]: true as const }
  );
}
