/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createClient } from 'redis';
import { logger } from '../util/logger.js';
import type { AuthorizationCache } from './authorizationCache.js';

/**
 * Does: Starts a reconnecting Redis connection and exposes bounded cache commands.
 * Called by: server startup and Redis integration fixtures.
 * Why: ARCH-029 permits database fallback without delaying readiness on Redis.
 */
export function createAuthorizationCache(configuration: {
  url: string;
  namespace: string;
}): AuthorizationCache {
  const client = createClient({
    url: configuration.url,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 1000,
      reconnectStrategy: retries => Math.min(100 * (retries + 1), 1000),
    },
  });
  const stats = {
    reads: 0,
    hits: 0,
    misses: 0,
    writes: 0,
    failures: 0,
    durationMs: 0,
  };
  let closed = false;
  let failed = false;
  client.on('error', () => {
    if (!failed && !closed)
      logger.warn(
        { event: 'cache.unavailable' },
        'Authorization cache unavailable; using PostgreSQL'
      );
    failed = true;
  });
  client.on('ready', () => {
    failed = false;
    logger.info({ event: 'cache.ready' }, 'Authorization cache connected');
  });
  void client.connect().catch(() => {
    /* Error event records connection failure. */
  });

  /** Does: Bounds one command and destroys a stalled socket before reconnecting. */
  async function command<T>(work: () => Promise<T>) {
    if (closed || !client.isReady) {
      stats.failures++;
      throw new Error('Cache unavailable');
    }
    const started = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error('Cache deadline'));
            // Destroy also bounds pending writes: timed-out work cannot queue indefinitely.
            if (client.isOpen) client.destroy();
            if (!closed) void client.connect().catch(() => {});
          }, 100);
        }),
      ]);
    } catch (error) {
      stats.failures++;
      throw error;
    } finally {
      clearTimeout(timer);
      stats.durationMs += performance.now() - started;
    }
  }
  return {
    namespace: configuration.namespace,
    /** Does: Reads a cached JSON envelope. Called by: revision-checked lookup services. */
    read: async key => {
      stats.reads++;
      const value = await command(() => client.get(key));
      if (value === null) stats.misses++;
      else stats.hits++;
      return value;
    },
    /** Does: Stores a five-minute JSON envelope. Called by: post-commit publication. */
    write: async (key, value) => {
      stats.writes++;
      await command(() => client.set(key, value, { EX: 300 }));
    },
    /** Does: Stops reconnects and closes the socket. Called by: runtime after HTTP drains. */
    close: () => {
      if (closed) return Promise.resolve();
      closed = true;
      logger.info(
        { event: 'cache.summary', ...stats },
        'Authorization cache operations'
      );
      if (client.isOpen) client.destroy();
      return Promise.resolve();
    },
  };
}
