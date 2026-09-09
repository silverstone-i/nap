/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { cacheTransaction } from '../db/authorizationCache.js';
import type { CacheTransaction } from '../db/authorizationCache.js';
import { logger } from '../util/logger.js';

/**
 * Does: Reads a revision-checked derived result or loads it from PostgreSQL.
 * Called by: session, routing and scoped authorization services in their transaction.
 * Why: ARCH-029 keeps database revisions authoritative and publishes only committed fills.
 */
export async function cachedLookup<T>(
  tx: CacheTransaction,
  domain: string,
  identity: string,
  schema: z.ZodType<T>,
  revision: () => Promise<string | undefined>,
  load: () => Promise<T>
): Promise<T> {
  const state = tx[cacheTransaction];
  if (!state) return load();
  const started = performance.now();
  // A database error must propagate; Redis alone never grants access.
  const before = await revision();
  if (!before) return load();
  const key = [
    'nap',
    'authz',
    'v1',
    state.cache.namespace,
    state.database,
    domain,
    identity,
    before,
  ]
    .map(encodeURIComponent)
    .join(':');
  let outcome = 'miss';
  try {
    const raw = await state.cache.read(key);
    if (raw !== null) {
      const envelope = z
        .object({ key: z.literal(key), value: schema })
        .safeParse(JSON.parse(raw));
      if (envelope.success) {
        logger.debug({
          event: 'cache.lookup',
          domain,
          outcome: 'hit',
          durationMs: performance.now() - started,
        });
        return envelope.data.value;
      }
      outcome = 'invalid';
    }
  } catch {
    outcome = 'fallback';
  }
  const result = await load();
  if (before === (await revision())) {
    // Parse into an immutable JSON snapshot, discarding fields outside the contract.
    const value = schema.parse(result);
    state.fills.set(key, JSON.stringify({ key, value }));
  }
  logger.debug({
    event: 'cache.lookup',
    domain,
    outcome,
    durationMs: performance.now() - started,
  });
  return result;
}
