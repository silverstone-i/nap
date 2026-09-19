/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';
import {
  CacheConsistencyError,
  normalizeRevisionKeys,
} from '../domain/cache.js';

/**
 * Schema object for `admin.cache_revisions`: a monotonic revision per cache dependency key.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const cacheRevisionsSchema = {
  dbSchema: 'admin',
  table: 'cache_revisions',
  columns: [
    { name: 'domain', type: 'text', notNull: true, immutable: true },
    { name: 'entity', type: 'text', notNull: true, immutable: true },
    { name: 'revision', type: 'bigint', notNull: true, default: 1 },
    {
      name: 'updated_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
  ],
  constraints: {
    primaryKey: ['domain', 'entity'],
    checks: ['revision > 0'],
  },
};

/** Model for `admin.cache_revisions`. */
export class CacheRevisions extends TableModel {
  static schema = cacheRevisionsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, cacheRevisionsSchema, logger);
  }

  /**
   * Read a complete canonical vector. Missing rows have revision `0` and are
   * not inserted.
   * @param {unknown} keys
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<{domain: string, entity: string, revision: string}[]>}
   */
  async current(keys, { tx } = {}) {
    const normalized = normalizeRevisionKeys(keys);
    const values = [];
    const tuples = normalized.map((key, index) => {
      values.push(key.domain, key.entity, index);
      const offset = index * 3;
      return `($${offset + 1}::text,$${offset + 2}::text,$${offset + 3}::integer)`;
    });
    try {
      return await (tx ?? this.db).any(
        `WITH requested(domain,entity,position) AS (VALUES ${tuples.join(',')})
         SELECT requested.domain, requested.entity,
                COALESCE(revisions.revision,0)::text AS revision
           FROM requested
           LEFT JOIN ${this.schemaName}.${this.tableName} AS revisions
             USING (domain,entity)
          ORDER BY requested.position`,
        values
      );
    } catch (error) {
      if (error instanceof CacheConsistencyError) throw error;
      throw new CacheConsistencyError('SERVICE_UNAVAILABLE');
    }
  }

  /**
   * Atomically advance a canonical key set inside the caller's transaction.
   * @param {unknown} keys
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{domain: string, entity: string, revision: string}[]>}
   */
  async advance(keys, { tx } = {}) {
    const normalized = normalizeRevisionKeys(keys);
    if (!tx || typeof tx.any !== 'function')
      throw new CacheConsistencyError('INVALID_INPUT');
    const values = [];
    const tuples = normalized.map((key, index) => {
      values.push(key.domain, key.entity, index);
      const offset = index * 3;
      return `($${offset + 1}::text,$${offset + 2}::text,$${offset + 3}::integer)`;
    });
    try {
      return await tx.any(
        `WITH requested(domain,entity,position) AS (VALUES ${tuples.join(',')}),
         advanced AS (
           INSERT INTO ${this.schemaName}.${this.tableName} AS revisions
             (domain,entity,revision,updated_at)
           SELECT domain,entity,1,now() FROM requested
           ON CONFLICT (domain,entity) DO UPDATE
             SET revision=revisions.revision+1, updated_at=now()
           RETURNING domain,entity,revision::text AS revision
         )
         SELECT requested.domain, requested.entity, advanced.revision
           FROM requested JOIN advanced USING (domain,entity)
          ORDER BY requested.position`,
        values
      );
    } catch {
      throw new CacheConsistencyError('SERVICE_UNAVAILABLE');
    }
  }
}
