/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHash } from 'node:crypto';
import { createClient } from 'redis';
import {
  CacheConsistencyError,
  normalizeRevisionKeys,
  revisionVectorsMatch,
} from '../../modules/admin-tenancy/domain/cache.js';

function report(logger, code) {
  if (typeof logger === 'function') logger(code);
  else if (typeof logger?.warn === 'function') logger.warn(code);
}

/**
 * Derive an opaque Redis key from caller identity and cache dependencies.
 * @param {string} namespace
 * @param {string} cacheKey
 * @param {{domain: string, entity: string}[]} keys Canonical revision keys.
 * @returns {string}
 */
export function cacheRedisKey(namespace, cacheKey, keys) {
  const digest = createHash('sha256')
    .update(JSON.stringify({ cacheKey, keys }))
    .digest('hex');
  return `${namespace}:authorization:${digest}`;
}

/**
 * Build the optional Redis-backed revision cache.
 * @param {object} options
 * @param {import('pg-schemata').Database} options.admin
 * @param {boolean} [options.enabled=false]
 * @param {string} [options.url]
 * @param {string} [options.namespace='nap']
 * @param {object|((code: string) => void)} [options.logger=console]
 * @param {typeof createClient} [options.clientFactory=createClient]
 * @returns {{getOrLoad: (cacheKey: string, keys: unknown, loader: (tx: object) => Promise<unknown>) => Promise<unknown>, close: () => Promise<void>}}
 */
export function createRevisionCache({
  admin,
  enabled = false,
  url,
  namespace = 'nap',
  logger = console,
  clientFactory = createClient,
}) {
  let client;
  let connecting;

  async function discardClient() {
    if (!client) return;
    try {
      client.destroy();
    } catch {
      /* The client is already unusable. */
    }
    client = undefined;
    connecting = undefined;
  }

  async function useRedis(operation) {
    if (!enabled) return { available: false };
    try {
      if (!client) {
        client = clientFactory({
          url,
          socket: { connectTimeout: 1000, reconnectStrategy: false },
        });
        client.on?.('error', () => report(logger, 'REDIS_CACHE_UNAVAILABLE'));
      }
      if (!client.isOpen) {
        if (!connecting)
          connecting = client.connect().finally(() => {
            connecting = undefined;
          });
        await connecting;
      }
      return { available: true, value: await operation(client) };
    } catch {
      report(logger, 'REDIS_CACHE_UNAVAILABLE');
      await discardClient();
      return { available: false };
    }
  }

  async function close() {
    if (!client) return;
    const closing = client;
    client = undefined;
    connecting = undefined;
    try {
      if (closing.isOpen) await closing.close();
      else closing.destroy();
    } catch {
      report(logger, 'REDIS_CACHE_CLOSE_FAILED');
      try {
        closing.destroy();
      } catch {
        /* The client is already closed. */
      }
    }
  }

  async function getOrLoad(cacheKey, keys, loader) {
    if (
      typeof cacheKey !== 'string' ||
      cacheKey.length === 0 ||
      cacheKey.length > 512 ||
      typeof loader !== 'function'
    )
      throw new CacheConsistencyError('INVALID_INPUT');
    const normalized = normalizeRevisionKeys(keys);
    const redisKey = cacheRedisKey(namespace, cacheKey, normalized);
    const cached = await useRedis(redis => redis.get(redisKey));
    if (cached.available && cached.value !== null) {
      let parsed;
      try {
        parsed = JSON.parse(cached.value);
      } catch {
        parsed = undefined;
      }
      const vector = await admin.db.cache_revisions.current(normalized);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed) &&
        Object.keys(parsed).sort().join(',') === 'value,vector' &&
        revisionVectorsMatch(parsed.vector, vector)
      )
        return parsed.value;
      await useRedis(redis => redis.del(redisKey));
    }

    let loaderFailure;
    let loaded;
    try {
      const { TransactionMode, isolationLevel } = admin.pgp.txMode;
      const mode = new TransactionMode({
        tiLevel: isolationLevel.repeatableRead,
        readOnly: true,
      });
      loaded = await admin.db.tx({ mode }, async tx => {
        let value;
        try {
          value = await loader(tx);
        } catch (error) {
          loaderFailure = error;
          throw error;
        }
        const vector = await tx.cache_revisions.current(normalized, { tx });
        return { value, vector };
      });
    } catch (error) {
      if (error === loaderFailure) throw error;
      if (error instanceof CacheConsistencyError) throw error;
      throw new CacheConsistencyError('SERVICE_UNAVAILABLE');
    }

    let encoded;
    try {
      encoded = JSON.stringify(loaded, (_key, value) => {
        if (
          value === undefined ||
          typeof value === 'bigint' ||
          typeof value === 'function' ||
          typeof value === 'symbol' ||
          (typeof value === 'number' && !Number.isFinite(value))
        )
          throw new TypeError('Cache values must be JSON serializable');
        return value;
      });
    } catch {
      throw new CacheConsistencyError('INVALID_INPUT');
    }
    await useRedis(redis => redis.set(redisKey, encoded));
    return loaded.value;
  }

  return { getOrLoad, close };
}
